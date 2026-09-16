/**
 * Поездка: город, даты, точка старта и отмеченные места.
 *
 * Зачем этот файл существует. До 16.09.2026 сайт был каталогом: он показывал
 * города и места и ничего не помнил про человека. Лендинг при этом обещал
 * «выбери город и даты → отметь, что хочешь → получи связный план».
 * Между «посмотрел» и «получил план» не было ступеньки — вот она.
 *
 * Где живёт состояние. В адресной строке, и копия — в локальном хранилище
 * браузера. Сервер не участвует: аккаунты вынесены за пределы первой версии
 * (ADR-0002), а ссылка решает ту же задачу и вдобавок делится одним движением.
 *
 * ПРАВИЛО СТАРШИНСТВА, одно и без исключений: если в адресе есть параметры
 * поездки — прав адрес. Иначе берётся локальное хранилище.
 *
 * Иначе получилось бы худшее: человек присылает другу ссылку на свой план,
 * у друга в хранилище лежит своя прошлая поездка, и он открывает не то, что
 * ему прислали. Такую ошибку почти невозможно заметить — обе поездки выглядят
 * правдоподобно.
 *
 * Ничего здесь не бросает исключений. Данные приходят из адресной строки,
 * то есть от кого угодно: мусор молча отбрасывается, а не роняет страницу.
 */
window.NF = window.NF || {};

NF.trip = (function () {
    'use strict';

    /** Ключ в локальном хранилище. Поездка запоминается по городу. */
    const STORAGE_PREFIX = 'nf.trip.';

    /** Сколько мест разрешаем отметить. Ограничение и от здравого смысла, и от длины ссылки. */
    const MAX_SELECTED = 60;

    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Проверку дат ведёт NF.dates и только он. Своя копия здесь уже была
    // и разошлась с ним на «0000-01-01»: trip.js дату принимал, dates.js
    // отвергал, и человек получал молча пустой план вместо объяснения.
    // Порядок подключения в страницах это гарантирует: dates.js идёт раньше.
    if (!window.NF || !NF.dates) {
        console.error('NF.trip: не найден NF.dates — подключи assets/js/dates.js раньше trip.js');
    }

    /** Пустая поездка — то, с чего начинается любая страница города. */
    function empty(cityId) {
        return { cityId: cityId || null, from: null, to: null, start: null, selected: [] };
    }

    // --- Разбор значений ---------------------------------------------------

    /**
     * Дата принимается, только если она существует.
     *
     * Проверку ведёт NF.dates.isValidISO — единственный источник правды.
     * Своя реализация здесь была и оказалась несовместимой с ним на границе
     * года; расхождение двух проверок одного и того же — это не дублирование
     * кода, это два разных ответа на один вопрос.
     */
    function readDate(value) {
        if (!NF.dates || !NF.dates.isValidISO) return null;
        return NF.dates.isValidISO(value) ? value : null;
    }

    function readIds(value) {
        if (typeof value !== 'string' || value === '') return [];
        const seen = Object.create(null);
        const out = [];
        value.split(',').forEach(function (raw) {
            const id = raw.trim();
            if (!UUID.test(id) || seen[id]) return;
            seen[id] = true;
            if (out.length < MAX_SELECTED) out.push(id);
        });
        return out;
    }

    /**
     * Точка старта в адресе записана как «широта,долгота,название».
     * Название необязательно: отель может быть без имени, координаты — нет.
     */
    function readStart(value) {
        if (typeof value !== 'string' || value === '') return null;
        const parts = value.split(',');
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        const name = parts.slice(2).join(',').trim();
        return { lat: lat, lng: lng, name: name || null };
    }

    /**
     * Даты приводятся к порядку: «от» не может быть позже «до».
     * Перепутать их местами легко, и молча построенная поездка на минус три дня
     * выглядела бы как поломка расчёта, а не как опечатка во вводе.
     */
    function orderDates(trip) {
        if (trip.from && trip.to && trip.from > trip.to) {
            const from = trip.from;
            trip.from = trip.to;
            trip.to = from;
        }
        return trip;
    }

    // --- Чтение и запись ---------------------------------------------------

    /** Разбирает поездку из строки запроса. Ничего не читает из хранилища. */
    function fromQuery(search) {
        const params = new URLSearchParams(search || '');
        // Идентификатор города проверяем так же, как идентификаторы мест:
        // мусор отсюда уедет прямо в запрос к базе.
        const cityId = params.get('id');
        const trip = empty(UUID.test(String(cityId)) ? cityId : null);
        trip.from = readDate(params.get('from'));
        trip.to = readDate(params.get('to'));
        trip.start = readStart(params.get('start'));
        trip.selected = readIds(params.get('sel'));
        return orderDates(trip);
    }

    /** Есть ли в адресе хоть что-то про поездку, кроме самого города. */
    function queryHasTrip(search) {
        const params = new URLSearchParams(search || '');
        return Boolean(params.get('from') || params.get('to') ||
                       params.get('sel') || params.get('start'));
    }

    /** Собирает строку запроса. Пустые поля не пишутся — ссылка и так длинная. */
    function toQuery(trip) {
        const params = new URLSearchParams();
        if (trip.cityId) params.set('id', trip.cityId);
        if (trip.from) params.set('from', trip.from);
        if (trip.to) params.set('to', trip.to);
        if (trip.start) {
            params.set('start', [trip.start.lat, trip.start.lng, trip.start.name || '']
                .join(',').replace(/,$/, ''));
        }
        if (trip.selected && trip.selected.length) params.set('sel', trip.selected.join(','));
        return params.toString();
    }

    /**
     * Хранилище может быть недоступно: приватный режим, запрет сторонних данных,
     * открытие файла с диска. Это не ошибка приложения — молча работаем без него.
     */
    function save(trip) {
        if (!trip || !trip.cityId) return false;
        try {
            window.localStorage.setItem(STORAGE_PREFIX + trip.cityId, JSON.stringify({
                from: trip.from, to: trip.to, start: trip.start, selected: trip.selected,
            }));
            return true;
        } catch (error) {
            return false;
        }
    }

    function load(cityId) {
        if (!cityId) return empty(cityId);
        let raw = null;
        try {
            raw = window.localStorage.getItem(STORAGE_PREFIX + cityId);
        } catch (error) {
            return empty(cityId);
        }
        if (!raw) return empty(cityId);

        let saved;
        try {
            saved = JSON.parse(raw);
        } catch (error) {
            return empty(cityId);
        }
        if (!saved || typeof saved !== 'object') return empty(cityId);

        const trip = empty(cityId);
        trip.from = readDate(saved.from);
        trip.to = readDate(saved.to);
        trip.start = saved.start ? readStart([saved.start.lat, saved.start.lng,
            saved.start.name || ''].join(',')) : null;
        trip.selected = readIds(Array.isArray(saved.selected) ? saved.selected.join(',') : '');
        return orderDates(trip);
    }

    function forget(cityId) {
        try {
            window.localStorage.removeItem(STORAGE_PREFIX + cityId);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Итоговая поездка для страницы: адрес старше хранилища.
     * См. правило старшинства в шапке файла — оно здесь и живёт.
     */
    function resolve(search) {
        const fromUrl = fromQuery(search);
        if (queryHasTrip(search)) return fromUrl;

        const stored = load(fromUrl.cityId);
        stored.cityId = fromUrl.cityId;
        return stored;
    }

    // --- Изменение ---------------------------------------------------------

    /** Отметить или снять место. Возвращает НОВУЮ поездку, вход не меняется. */
    function toggle(trip, placeId) {
        const next = Object.assign({}, trip, { selected: trip.selected.slice() });
        const at = next.selected.indexOf(placeId);
        if (at === -1) {
            if (next.selected.length >= MAX_SELECTED) return trip;
            next.selected.push(placeId);
        } else {
            next.selected.splice(at, 1);
        }
        return next;
    }

    function isSelected(trip, placeId) {
        return trip.selected.indexOf(placeId) !== -1;
    }

    /** Готова ли поездка к расчёту: есть даты и хотя бы одно место. */
    function missing(trip) {
        const gaps = [];
        if (!trip.from || !trip.to) gaps.push('даты поездки');
        if (!trip.selected.length) gaps.push('хотя бы одно отмеченное место');
        return gaps;
    }

    return {
        empty: empty,
        fromQuery: fromQuery,
        queryHasTrip: queryHasTrip,
        toQuery: toQuery,
        save: save,
        load: load,
        forget: forget,
        resolve: resolve,
        toggle: toggle,
        isSelected: isSelected,
        missing: missing,
        MAX_SELECTED: MAX_SELECTED,
    };
})();
