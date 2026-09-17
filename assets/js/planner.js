/**
 * Планировщик: порядок мест внутри дня и раскладка мест по дням.
 *
 * Зачем он есть. Боль, ради которой затеян продукт (ADR-0002), не в том, что
 * человек не знает, ЧТО посмотреть, а в том, что он не знает, В КАКОМ ПОРЯДКЕ —
 * и теряет дни на возвраты, крюки и простои.
 *
 * Модуль чистый: ни document, ни NF.api, ни fetch, ни Date.now() (AC-008).
 * «Сейчас» не нужно вовсе — даты подаются аргументом. Причина не в красоте:
 * расчёт, который сам ходит в хранилище и сам смотрит на часы, нельзя ни
 * проверить тестом, ни увезти в Edge Function (TRANSFER-FROM-WB, 1.9).
 *
 * Все числа здесь — оценки и помечены как оценки: время в пути считается
 * по прямой (A1, провайдер карт не выбран — ADR-0006), длительность посещения
 * подставляется, когда её нет в данных (A3). Выдумывать их молча запрещено,
 * поэтому раскладка explain (AC-007) — не украшение: доверие к порядку и есть
 * продукт (TRANSFER-FROM-WB, 1.11).
 *
 * Две тонкости, которые легко нарушить по невнимательности: у последней точки
 * дня время в пути до следующей — null, а не ноль (AC-002: «идти некуда», а не
 * «ноль минут»); dropped («невозможно разместить», AC-003) и not_fitted
 * («не хватило дней», AC-006) — разные вещи, и смешать их значит сказать,
 * что место сломано, когда поездка просто короткая.
 */
window.NF = window.NF || {};

NF.planner = (function () {
    'use strict';

    /** Значения по умолчанию — это допущения A1, A2, A3, A7, а не мои выдумки. */
    const DEFAULTS = {
        dayStart: '09:00', dayEnd: '21:00', defaultVisitMinutes: 60,
        speedKmh: 18, detourFactor: 1.35, nearbyMinutes: 15,
    };

    /** Простой длиннее этого — дыра в дне, а не пауза на обед (AC-006). */
    const IDLE_WARN_MINUTES = 90;
    /** Переход дольше этого — подозрение на крюк, человек должен его увидеть. */
    const LONG_TRAVEL_MINUTES = 60;
    /**
     * До скольки точек день считается полным перебором: 2-opt даёт локальный
     * оптимум, а AC-004 требует при N ≤ 7 глобального.
     */
    const EXACT_MAX_POINTS = 8;

    const NUMERIC_OPTIONS = ['defaultVisitMinutes', 'speedKmh', 'detourFactor', 'nearbyMinutes'];
    const EARTH_RADIUS_KM = 6371;
    const MINUTES_IN_HOUR = 60;
    const MINUTES_IN_DAY = 1440;
    const NO_COORDS_REASON = 'нет координат — не могу разместить';
    const NO_DAYS_REASON = 'не хватило дней поездки';
    const TOO_LONG_REASON = 'дорога и посещение дольше окна дня';
    const CLOCK_RE = /^(\d{1,2}):(\d{2})$/;
    // --- Мелкие проверки и формат ------------------------------------------
    /**
     * Схема запрещает null в lat/lng, но расчёт держит удар и от данных не из
     * базы: ручной ввод, импорт, параметр ссылки (AC-003). Строка «23.1» тоже
     * не проходит — приведение типов даёт NaN в середине расчёта.
     */
    function hasValidCoords(point) {
        if (!point || typeof point.lat !== 'number' || typeof point.lng !== 'number') return false;
        if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false;
        return Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
    }
    /** '09:00' → 540. Не время, а смещение от полуночи: пояс здесь ни при чём. */
    function parseClock(text) {
        const parts = CLOCK_RE.exec(String(text));
        if (!parts) return null;
        const minutes = Number(parts[1]) * MINUTES_IN_HOUR + Number(parts[2]);
        return minutes >= 0 && minutes <= MINUTES_IN_DAY ? minutes : null;
    }
    /** 540 → '09:00'. */
    function formatClock(minutes) {
        const whole = Math.max(0, Math.round(minutes));
        return String(Math.floor(whole / MINUTES_IN_HOUR)).padStart(2, '0') + ':' +
            String(whole % MINUTES_IN_HOUR).padStart(2, '0');
    }
    /** 150 → «2 ч 30 мин»: предупреждения читает человек, а не машина. */
    function humanMinutes(minutes) {
        const whole = Math.max(0, Math.round(minutes));
        const hours = Math.floor(whole / MINUTES_IN_HOUR);
        const rest = whole % MINUTES_IN_HOUR;
        if (!hours) return rest + ' мин';
        return rest ? hours + ' ч ' + rest + ' мин' : hours + ' ч';
    }
    function nameOf(point) {
        return point ? (point.name || point.name_local || 'без названия') : 'старт';
    }
    /** Порядок по id: результат не должен зависеть от порядка галочек. */
    function byId(a, b) {
        return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    }
    // --- Расстояние и время в пути -----------------------------------------
    /** Расстояние по большому кругу, километры. Общий помощник — NF.geo. */
    function haversineKm(from, to) {
        return NF.geo.betweenPoints(from, to);
    }
    /**
     * Время в пути в целых минутах — оценка, а не факт (A1). Делим на скорость,
     * а не на расстояние: два места в одной точке дают ноль, а не деление
     * на ноль. Кэш живёт внутри вызова planRoute и наружу не виден.
     */
    function travelMinutes(from, to, opts) {
        const key = from.lat + ',' + from.lng + '>' + to.lat + ',' + to.lng;
        const cached = opts.cache.get(key);
        if (cached !== undefined) return cached;
        const minutes = Math.round(
            haversineKm(from, to) * opts.detourFactor / opts.speedKmh * MINUTES_IN_HOUR);
        opts.cache.set(key, minutes);
        return minutes;
    }
    /** Длина окна дня в минутах: 09:00–21:00 это 720 (допущение A2). */
    function windowOf(opts) {
        return Math.max(0, opts.dayEndMinutes - opts.dayStartMinutes);
    }
    /** Сумма переходов по цепочке. Старта нет — до первой точки не идём. */
    function pathMinutes(seq, start, opts) {
        let total = 0;
        let prev = start;
        seq.forEach(function (place) {
            if (prev) total += travelMinutes(prev, place, opts);
            prev = place;
        });
        return total;
    }
    /** Насколько точка близка ко всем остальным: сумма переходов до каждой. */
    function centrality(point, points, opts) {
        return points.reduce(function (acc, other) {
            return other === point ? acc : acc + travelMinutes(point, other, opts);
        }, 0);
    }
    // --- Порядок внутри дня (AC-004) ---------------------------------------
    /** Жадный обход «ближайший следующий» — заготовка, которую потом улучшают. */
    function nearestNeighbour(points, start, opts) {
        const rest = points.slice(), seq = [];
        let current = start;
        if (!current) {
            // Старта нет — первой идёт точка, ближайшая ко всем остальным.
            current = rest.reduce(function (best, place) {
                return centrality(place, rest, opts) < centrality(best, rest, opts) ? place : best;
            }, rest[0]);
            seq.push(current);
            rest.splice(rest.indexOf(current), 1);
        }
        while (rest.length) {
            let at = 0;
            rest.forEach(function (place, index) {
                const near = travelMinutes(current, rest[at], opts);
                if (travelMinutes(current, place, opts) < near) at = index;
            });
            current = rest.splice(at, 1)[0];
            seq.push(current);
        }
        return seq;
    }
    /** Три хода: AC-004 требует и разворота участка (2-opt), и обмена точек,
     *  а обмен несоседних точек разворотом не выражается. */
    function variants(seq, i, j) {
        const swapped = seq.slice();
        swapped[i] = seq[j];
        swapped[j] = seq[i];
        const moved = seq.slice();
        moved.splice(j, 0, moved.splice(i, 1)[0]);
        const reversed = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
        return [reversed, swapped, moved];
    }
    /** Первая перестановка пары (i, j), которая уменьшает время в пути. */
    function pickBetter(seq, i, j, start, opts, cost) {
        return variants(seq, i, j).find(function (variant) {
            return pathMinutes(variant, start, opts) < cost;
        }) || null;
    }
    function improveOnce(seq, start, opts) {
        const cost = pathMinutes(seq, start, opts);
        for (let i = 0; i < seq.length; i++) {
            for (let j = i + 1; j < seq.length; j++) {
                const better = pickBetter(seq, i, j, start, opts, cost);
                if (better) return better;
            }
        }
        return null;
    }
    /** Цикл конечен без счётчика: каждый шаг уменьшает целое число минут. */
    function improve(seq, start, opts) {
        let current = seq;
        let next = improveOnce(current, start, opts);
        while (next) { current = next; next = improveOnce(current, start, opts); }
        return current;
    }
    /** Точный ответ для короткого дня: эталон, а не мнение (AC-004, форма 1). */
    function bestExact(points, start, opts) {
        if (points.length <= 1) return points.slice();
        let best = null;
        points.forEach(function (head, index) {
            const rest = points.slice(0, index).concat(points.slice(index + 1));
            const seq = [head].concat(bestExact(rest, head, opts));
            if (!best || pathMinutes(seq, start, opts) < pathMinutes(best, start, opts)) best = seq;
        });
        return best;
    }
    /** Без старта путь стоит одинаково в обе стороны: направление выбираем
     *  правилом, а не случаем — первой идёт точка, ближайшая к остальным. */
    function orientOpenPath(seq, opts) {
        if (seq.length < 2) return seq;
        const tail = centrality(seq[seq.length - 1], seq, opts);
        return tail < centrality(seq[0], seq, opts) ? seq.slice().reverse() : seq;
    }
    function orderPoints(points, start, opts) {
        if (points.length < 2) return points.slice();
        const seq = points.length <= EXACT_MAX_POINTS
            ? bestExact(points, start, opts)
            : improve(nearestNeighbour(points, start, opts), start, opts);
        return start ? seq : orientOpenPath(seq, opts);
    }
    // --- Отбор и подготовка входа ------------------------------------------
    function resolveOptions(raw) {
        const given = raw || {};
        const opts = { cache: new Map() };
        NUMERIC_OPTIONS.forEach(function (name) {
            const value = Number(given[name]);
            opts[name] = Number.isFinite(value) && value > 0 ? value : DEFAULTS[name];
        });
        opts.defaultVisitMinutes = Math.round(opts.defaultVisitMinutes);
        ['dayStart', 'dayEnd'].forEach(function (name) {
            const value = parseClock(given[name]);
            opts[name + 'Minutes'] = value === null ? parseClock(DEFAULTS[name]) : value;
        });
        return opts;
    }
    /** Длительность посещения и признак, что она подставлена (допущение A3). */
    function visitOf(place, opts) {
        const raw = Number(place.visit_minutes);
        if (Number.isFinite(raw) && raw > 0) return { minutes: Math.round(raw), assumed: false };
        return { minutes: opts.defaultVisitMinutes, assumed: true };
    }
    /** Фильтр режет набор здесь, на входе расчёта, а не при отрисовке у каждого
     *  потребителя (TRANSFER-FROM-WB, 1.10 — там эта ошибка поймана пять раз). */
    function splitSelection(places, selectedIds) {
        const wanted = new Set(Array.isArray(selectedIds) ? selectedIds : []);
        const seen = new Set(), usable = [], dropped = [];
        (Array.isArray(places) ? places : []).forEach(function (place) {
            if (!place || !wanted.has(place.id) || seen.has(place.id)) return;
            seen.add(place.id);
            if (hasValidCoords(place)) usable.push(place);
            else dropped.push({ place: place, reason: NO_COORDS_REASON });
        });
        usable.sort(byId);
        return { usable: usable, dropped: dropped, wanted: wanted };
    }
    function normalizeStart(start) {
        if (!hasValidCoords(start)) return null;
        return { lat: start.lat, lng: start.lng, name: start.name || 'точка старта' };
    }
    // --- Раскладка по дням --------------------------------------------------
    /**
     * Точки набираются в день, пока укладываются в окно, остальное едет дальше.
     * Место, не влезающее и в пустой день, уходит в «не влезло» сразу, иначе
     * очередь встала бы на нём навсегда.
     */
    function packDays(ordered, dates, start, opts) {
        const queue = ordered.slice(), groups = [], notFitted = [];
        dates.forEach(function () {
            const picked = [];
            let clock = opts.dayStartMinutes;
            let prev = start;
            while (queue.length) {
                const place = queue[0];
                const travel = prev ? travelMinutes(prev, place, opts) : 0;
                const visit = visitOf(place, opts).minutes;
                if (clock + travel + visit > opts.dayEndMinutes) {
                    if (picked.length) break;
                    notFitted.push({ place: queue.shift(), reason: TOO_LONG_REASON });
                } else {
                    picked.push(queue.shift());
                    clock += travel + visit;
                    prev = place;
                }
            }
            groups.push(picked);
        });
        queue.forEach(function (place) {
            notFitted.push({ place: place, reason: NO_DAYS_REASON });
        });
        return { groups: groups, notFitted: notFitted };
    }
    /** Точки дня с временем прихода и ухода. Порядок уже посчитан, здесь часы. */
    function buildItems(seq, start, opts) {
        const items = [];
        let clock = opts.dayStartMinutes;
        let prev = start;
        let travelTotal = 0, visitTotal = 0;
        seq.forEach(function (place) {
            const travel = prev ? travelMinutes(prev, place, opts) : 0;
            const visit = visitOf(place, opts);
            clock += travel;
            travelTotal += travel;
            visitTotal += visit.minutes;
            items.push({
                place: place, minutes: visit.minutes, minutesAssumed: visit.assumed,
                arrive: formatClock(clock), leave: formatClock(clock + visit.minutes),
                travelMinutesToNext: null, // null, а не 0: идти некуда (AC-002)
            });
            clock += visit.minutes;
            prev = place;
        });
        for (let i = 0; i < items.length - 1; i++) {
            items[i].travelMinutesToNext = travelMinutes(seq[i], seq[i + 1], opts);
        }
        return { items: items, travelTotal: travelTotal, visitTotal: visitTotal };
    }
    function buildDay(date, group, start, opts) {
        const built = buildItems(orderPoints(group, start, opts), start, opts);
        return {
            date: date, items: built.items,
            travelMinutesTotal: built.travelTotal, visitMinutesTotal: built.visitTotal,
            idleMinutes: Math.max(0, windowOf(opts) - built.travelTotal - built.visitTotal),
        };
    }
    // --- Предупреждения (AC-006) -------------------------------------------
    function warning(type, date, value, text) {
        return { type: type, date: date, value: value, text: text };
    }
    function notFittedWarnings(notFitted) {
        const noRoom = notFitted.filter(function (e) { return e.reason === NO_DAYS_REASON; });
        const out = notFitted.filter(function (e) { return e.reason !== NO_DAYS_REASON; })
            .map(function (entry) {
                return warning('not_fitted', null, 1, '«' + nameOf(entry.place) +
                    '» не влезает ни в один день: ' + entry.reason + '.');
            });
        if (noRoom.length) {
            out.push(warning('not_fitted', null, noRoom.length, 'Не влезло: ' + noRoom.length +
                ' — не хватило дней поездки (' +
                noRoom.map(function (e) { return nameOf(e.place); }).join(', ') + ').'));
        }
        return out;
    }
    function dayWarnings(day, index) {
        const label = 'День ' + (index + 1);
        const out = day.idleMinutes > IDLE_WARN_MINUTES
            ? [warning('idle', day.date, day.idleMinutes,
                label + ': простой ' + humanMinutes(day.idleMinutes) + '.')]
            : [];
        day.items.forEach(function (item, at) {
            const travel = item.travelMinutesToNext;
            if (travel === null || travel <= LONG_TRAVEL_MINUTES) return;
            out.push(warning('long_travel', day.date, travel,
                label + ': переход от «' + nameOf(item.place) + '» к «' +
                nameOf(day.items[at + 1].place) + '» занимает ' + humanMinutes(travel) + '.'));
        });
        return out;
    }
    function collectWarnings(days, notFitted, start) {
        let out = start ? [] : [warning('no_start', null, null,
            'Точка старта не задана: время в пути до первой точки дня не посчитано.')];
        out = out.concat(notFittedWarnings(notFitted));
        days.forEach(function (day, index) { out = out.concat(dayWarnings(day, index)); });
        return out;
    }
    // --- «Что рядом» (AC-005) ----------------------------------------------
    /** Ближайшая точка плана к месту — вместе с днём, к которому она относится. */
    function closestPlanned(place, planned, opts) {
        return planned.reduce(function (best, point) {
            const minutes = travelMinutes(point.place, place, opts);
            return !best || minutes < best.minutes ? { point: point, minutes: minutes } : best;
        }, null);
    }
    /**
     * «Рядом» обязано быть конкретным: что, от какой точки плана, сколько минут
     * и в какой день (AC-005). Выбранное человеком сюда не попадает, как и то,
     * что заведомо не влезает в остаток дня.
     */
    function buildNearby(places, wanted, days, opts) {
        const planned = days.reduce(function (acc, day) {
            return acc.concat(day.items.map(function (item) {
                return { place: item.place, date: day.date, idle: day.idleMinutes };
            }));
        }, []);
        const out = [];
        (Array.isArray(places) ? places : []).forEach(function (place) {
            if (!place || wanted.has(place.id) || !hasValidCoords(place) || !planned.length) return;
            const best = closestPlanned(place, planned, opts);
            if (best.minutes > opts.nearbyMinutes) return;
            if (best.minutes + visitOf(place, opts).minutes > best.point.idle) return;
            out.push({ place: place, fromPlace: best.point.place,
                minutes: best.minutes, date: best.point.date });
        });
        out.sort(function (a, b) { return a.minutes - b.minutes || byId(a.place, b.place); });
        return out;
    }
    // --- Раскладка чисел (AC-007) ------------------------------------------
    /** «18 + 25 + 12 = 55»: итог, который можно разложить обратно на слагаемые. */
    function block(parts, sum, sign, extra) {
        const numbers = parts.map(function (part) { return part.minutes; });
        return Object.assign({
            parts: parts,
            sum: sum,
            formula: numbers.length ? numbers.join(sign) + ' = ' + sum : String(sum),
        }, extra);
    }
    /** Переходы дня поимённо: «старт → А», «А → Б». Все помечены оценкой (A1). */
    function travelParts(day, start, opts) {
        const parts = day.items.slice(0, -1).map(function (item, i) {
            return { from: nameOf(item.place), to: nameOf(day.items[i + 1].place),
                minutes: item.travelMinutesToNext, assumed: true };
        });
        if (start && day.items.length) {
            parts.unshift({ from: nameOf(start), to: nameOf(day.items[0].place), assumed: true,
                minutes: travelMinutes(start, day.items[0].place, opts) });
        }
        return parts;
    }
    function explainDay(day, start, opts) {
        const travel = travelParts(day, start, opts);
        const visits = day.items.map(function (item) {
            return { place: nameOf(item.place), minutes: item.minutes,
                assumed: item.minutesAssumed };
        });
        const span = windowOf(opts);
        const idle = [span, day.travelMinutesTotal, day.visitMinutesTotal]
            .map(function (minutes) { return { minutes: minutes }; });
        return {
            date: day.date, idle: block(idle, day.idleMinutes, ' - '),
            travel: block(travel, day.travelMinutesTotal, ' + ', { assumed: true }),
            visits: block(visits, day.visitMinutesTotal, ' + ', {
                assumedCount: visits.filter(function (part) { return part.assumed; }).length,
            }),
            window: { start: formatClock(opts.dayStartMinutes), minutes: span,
                end: formatClock(opts.dayEndMinutes) },
        };
    }
    function sumBy(list, key) {
        return list.reduce(function (acc, item) { return acc + item[key]; }, 0);
    }
    function buildExplain(days, start, opts, counts) {
        return {
            assumptions: {
                dayStart: formatClock(opts.dayStartMinutes), speedKmh: opts.speedKmh,
                dayEnd: formatClock(opts.dayEndMinutes), detourFactor: opts.detourFactor,
                defaultVisitMinutes: opts.defaultVisitMinutes, startGiven: Boolean(start),
                nearbyMinutes: opts.nearbyMinutes, travelIsEstimate: true,
                notes: [
                    'Время в пути — оценка по прямой с коэффициентом ' + opts.detourFactor +
                        ' при скорости ' + opts.speedKmh + ' км/ч, а не маршрут по картам (A1).',
                    'Длительность ' + opts.defaultVisitMinutes + ' мин подставлена там, ' +
                        'где её нет в данных, и помечена как подставленная (A3).',
                    'Часы работы мест не учитываются (A4).',
                ],
            },
            totals: {
                days: days.length, travelMinutes: sumBy(days, 'travelMinutesTotal'),
                visitMinutes: sumBy(days, 'visitMinutesTotal'),
                idleMinutes: sumBy(days, 'idleMinutes'),
                placesSelected: counts.selected, placesPlanned: counts.planned,
                placesDropped: counts.dropped, placesNotFitted: counts.notFitted,
            },
            days: days.map(function (day) { return explainDay(day, start, opts); }),
        };
    }
    // --- Точка входа --------------------------------------------------------
    /**
     * Строит план. Вход не изменяется, выход зависит только от входа. Даты
     * приходят готовым списком — их считает NF.dates, «сегодня» здесь нет
     * (AC-008). Полнота ввода (AC-001) проверяется до вызова: это вопрос экрана.
     */
    function planRoute(input) {
        const src = input || {};
        const opts = resolveOptions(src.options);
        const dates = Array.isArray(src.dates) ? src.dates.slice() : [];
        const start = normalizeStart(src.start);
        const selection = splitSelection(src.places, src.selectedIds);
        const packed = packDays(orderPoints(selection.usable, start, opts), dates, start, opts);
        const days = dates.map(function (date, index) {
            return buildDay(date, packed.groups[index], start, opts);
        });
        return {
            days: days, dropped: selection.dropped,
            warnings: collectWarnings(days, packed.notFitted, start),
            nearby: buildNearby(src.places, selection.wanted, days, opts),
            explain: buildExplain(days, start, opts, {
                selected: selection.usable.length + selection.dropped.length,
                planned: days.reduce(function (acc, day) { return acc + day.items.length; }, 0),
                dropped: selection.dropped.length,
                notFitted: packed.notFitted.length,
            }),
        };
    }

    return {
        planRoute: planRoute, DEFAULTS: DEFAULTS,
        IDLE_WARN_MINUTES: IDLE_WARN_MINUTES, LONG_TRAVEL_MINUTES: LONG_TRAVEL_MINUTES,
    };
})();
