/**
 * Проверка планировщика.
 *
 * Здесь намеренно нет jsdom. AC-008 требует, чтобы расчёт работал в голом node
 * без браузера и без сети, и тест обязан это доказывать, а не обходить: модуль
 * поднимается в песочнице `node:vm`, где из окружения есть только `window`
 * и `console`. Если в planner.js появится обращение к `document`, `fetch`
 * или `NF.api`, файл упадёт прямо здесь.
 *
 * Эталон времени в пути посчитан в этом файле заново, а не взят из модуля.
 * Тест, который берёт эталон у проверяемой функции, проверяет сам себя:
 * на порядке точек (AC-004) полный перебор обязан быть независимым.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
// Общий помощник геометрии. Модуль от него зависит, поэтому в стенде
// он загружается первым — как и на странице.
const GEO_SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/geo.js'), 'utf8');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/planner.js'), 'utf8');

/** Поднимает planner.js в песочнице без браузера. */
function load() {
    const sandbox = { console: console };
    sandbox.window = sandbox; // в браузере window и есть глобальный объект
    vm.createContext(sandbox);
    vm.runInContext(GEO_SOURCE, sandbox);
    vm.runInContext(SOURCE, sandbox);
    return sandbox.NF.planner;
}

const planner = load();

/**
 * Песочница vm живёт в своём мире: массив из неё не «reference-equal» нашему,
 * и deepStrictEqual спотыкается о прототипы, а не о значения. Сравниваем
 * структуры через JSON — по значениям, как их увидит страница.
 */
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

// --- Эталон и данные ----------------------------------------------------

const SPEED_KMH = 18;
const DETOUR = 1.35;

/** Время в пути по тем же правилам, но написанное отдельно от модуля. */
function refMinutes(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
    return Math.round(km * DETOUR / SPEED_KMH * 60);
}

/** Суммарное время в пути за день: от старта и дальше по цепочке. */
function refPath(seq, start) {
    let total = 0;
    let prev = start;
    seq.forEach(function (point) {
        if (prev) total += refMinutes(prev, point);
        prev = point;
    });
    return total;
}

function place(id, lat, lng, extra) {
    return Object.assign({ id: id, name: 'Место ' + id, lat: lat, lng: lng }, extra || {});
}

/** Пять мест вокруг центра Гуанчжоу, разбросанных нарочно «вперемешку». */
function sample(count, minutes) {
    const offsets = [[0.04, 0.01], [0.01, 0.05], [0.06, 0.06], [0.02, 0.02],
        [0.05, 0.03], [0.03, 0.07], [0.07, 0.02], [0.01, 0.01], [0.06, 0.01],
        [0.02, 0.06], [0.04, 0.05], [0.07, 0.07]];
    return offsets.slice(0, count).map(function (offset, index) {
        return place('p' + index, 23.1 + offset[0], 113.25 + offset[1],
            minutes === undefined ? {} : { visit_minutes: minutes });
    });
}

const START = { lat: 23.12, lng: 113.26, name: 'Отель' };
const DATES = ['2026-04-01', '2026-04-02'];

function allIds(places) {
    return places.map(function (item) { return item.id; });
}

function plan(places, options) {
    return planner.planRoute(Object.assign({
        places: places, selectedIds: allIds(places), dates: DATES, start: START,
    }, options || {}));
}

function itemsOf(day) {
    return day.items.map(function (item) { return item.place; });
}

function byType(result, type) {
    return result.warnings.filter(function (item) { return item.type === type; });
}

// --- AC-008: чистота ----------------------------------------------------

test('AC-008: модуль поднимается в голом node, без jsdom и без сети', () => {
    assert.strictEqual(typeof planner.planRoute, 'function');
    assert.strictEqual(typeof globalThis.document, 'undefined');
});

test('AC-008: в коде нет обращений к document, NF.api, fetch и Date.now', () => {
    // Комментарии вырезаны: в них эти слова стоят как раз для объяснения,
    // почему их нет в коде, и сторож, ругающийся на объяснение, бесполезен.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    ['document', 'NF.api', 'fetch(', 'Date.now', 'localStorage', 'XMLHttpRequest']
        .forEach(function (forbidden) {
            assert.ok(!code.includes(forbidden), 'в коде найдено: ' + forbidden);
        });
});

test('значения по умолчанию — те же, что в критериях приёмки (A1, A2, A3, A7)', () => {
    assert.deepStrictEqual(plain(planner.DEFAULTS), {
        dayStart: '09:00', dayEnd: '21:00', defaultVisitMinutes: 60,
        speedKmh: SPEED_KMH, detourFactor: DETOUR, nearbyMinutes: 15,
    });
});

// --- AC-002: три числа у каждой точки -----------------------------------

test('AC-002: у каждой точки есть приход, длительность и время в пути', () => {
    const day = plan(sample(4, 30)).days[0];
    assert.ok(day.items.length >= 2);
    day.items.forEach(function (item, index) {
        assert.match(item.arrive, /^\d{2}:\d{2}$/);
        assert.match(item.leave, /^\d{2}:\d{2}$/);
        assert.ok(item.minutes > 0);
        const last = index === day.items.length - 1;
        assert.strictEqual(item.travelMinutesToNext === null, last);
        if (!last) assert.strictEqual(typeof item.travelMinutesToNext, 'number');
    });
});

test('AC-002: у последней точки дня время в пути именно null, а не ноль', () => {
    const day = plan(sample(3, 30)).days[0];
    const last = day.items[day.items.length - 1];
    assert.strictEqual(last.travelMinutesToNext, null);
    assert.notStrictEqual(last.travelMinutesToNext, 0);
});

test('AC-002: часы сходятся — уход это приход плюс длительность плюс дорога', () => {
    const day = plan(sample(4, 45)).days[0];
    const minutes = function (clock) {
        const parts = clock.split(':');
        return Number(parts[0]) * 60 + Number(parts[1]);
    };
    day.items.forEach(function (item, index) {
        assert.strictEqual(minutes(item.leave), minutes(item.arrive) + item.minutes);
        const next = day.items[index + 1];
        if (next) {
            assert.strictEqual(minutes(next.arrive), minutes(item.leave) + item.travelMinutesToNext);
        }
    });
    assert.strictEqual(minutes(day.items[0].arrive), 9 * 60 + refMinutes(START, day.items[0].place));
});

// --- AC-003: битые координаты -------------------------------------------

test('AC-003: место без пригодных координат уходит в dropped с причиной', () => {
    const broken = [
        place('b1', null, 113.3),
        place('b2', 23.1, undefined),
        place('b3', '23.1', '113.3'),
        place('b4', 95, 113.3),
        place('b5', 23.1, 200),
        place('b6', NaN, 113.3),
    ];
    const good = sample(3, 30);
    const result = plan(good.concat(broken));

    assert.strictEqual(result.dropped.length, broken.length);
    result.dropped.forEach(function (entry) {
        assert.match(entry.reason, /нет координат/);
        assert.ok(entry.place);
    });
    const planned = result.days.reduce(function (acc, day) { return acc.concat(itemsOf(day)); }, []);
    assert.deepStrictEqual(planned.map(function (p) { return p.id; }).sort(), allIds(good));
});

test('AC-003: битый элемент не роняет расчёт и не отменяет остальной план', () => {
    const result = plan([place('ok', 23.13, 113.27, { visit_minutes: 30 }), place('bad', null, null)]);
    assert.strictEqual(result.days[0].items.length, 1);
    assert.strictEqual(result.explain.totals.placesPlanned, 1);
    assert.strictEqual(result.explain.totals.placesDropped, 1);
});

// --- AC-004: порядок внутри дня -----------------------------------------

/**
 * Набор, на котором жадный обход «ближайший следующий» ошибается: он даёт
 * 218 минут против 206 у лучшей перестановки. Он здесь не для красоты —
 * без него тест проходил бы и с одним жадным обходом, то есть не проверял
 * бы ничего (поймано проверкой мутацией).
 */
const GREEDY_TRAP = [
    [23.209, 113.238], [23.166, 113.247], [23.092, 113.358],
    [23.224, 113.369], [23.072, 113.294], [23.196, 113.273],
].map(function (point, index) {
    return place('t' + index, point[0], point[1], { visit_minutes: 5 });
});

/** Все перестановки списка: эталон для полного перебора. */
function permute(list) {
    if (list.length <= 1) return [list];
    return list.reduce(function (acc, item, index) {
        const rest = list.slice(0, index).concat(list.slice(index + 1));
        return acc.concat(permute(rest).map(function (tail) { return [item].concat(tail); }));
    }, []);
}

test('AC-004 (форма 1): при N ≤ 7 день не хуже полного перебора', () => {
    [sample(6, 5), GREEDY_TRAP].forEach(function (places) {
        const day = plan(places).days[0];
        assert.strictEqual(day.items.length, 6);

        const best = permute(places).reduce(function (min, seq) {
            return Math.min(min, refPath(seq, START));
        }, Infinity);

        assert.strictEqual(refPath(itemsOf(day), START), day.travelMinutesTotal);
        assert.ok(day.travelMinutesTotal <= best,
            'день ' + day.travelMinutesTotal + ' мин против лучшего ' + best);
    });
});

test('AC-004 (форма 2): при большом N ни один разворот, обмен или перенос не улучшает день', () => {
    const places = sample(11, 5);
    const day = plan(places).days[0];
    const seq = itemsOf(day);
    assert.strictEqual(seq.length, 11);

    const cost = refPath(seq, START);
    for (let i = 0; i < seq.length; i++) {
        for (let j = i + 1; j < seq.length; j++) {
            const swapped = seq.slice();
            swapped[i] = seq[j];
            swapped[j] = seq[i];
            const moved = seq.slice();
            moved.splice(j, 0, moved.splice(i, 1)[0]);
            const reversed = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1));
            [swapped, moved, reversed].forEach(function (variant) {
                assert.ok(refPath(variant, START) >= cost,
                    'нашлась перестановка лучше: ' + refPath(variant, START) + ' < ' + cost);
            });
        }
    }
});

test('AC-004: порядок галочек на план не влияет', () => {
    const places = sample(7, 20);
    const straight = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: DATES, start: START,
    });
    const shuffled = planner.planRoute({
        places: places, selectedIds: allIds(places).slice().reverse(), dates: DATES, start: START,
    });
    assert.deepStrictEqual(plain(shuffled), plain(straight));
});

test('AC-004: порядок мест в самой выборке на план не влияет', () => {
    // Отдельно от порядка галочек: набор из базы может прийти в любом порядке
    // (другая сортировка запроса), а план обязан получиться тот же. Два места
    // в одной точке добавлены нарочно: там выбор решает не расстояние,
    // и без явного порядка по id он достался бы порядку выборки.
    const places = sample(8, 30).concat([
        place('zz', 23.131, 113.271, { visit_minutes: 30 }),
        place('aa', 23.131, 113.271, { visit_minutes: 30 }),
    ]);
    const straight = plan(places);
    const reversed = plan(places.slice().reverse());
    assert.deepStrictEqual(plain(reversed), plain(straight));
});

test('на одинаковом входе выход одинаковый дважды подряд', () => {
    const places = sample(9, 40);
    const first = JSON.stringify(plan(places));
    const second = JSON.stringify(plan(places));
    assert.strictEqual(first, second);
});

test('входные данные не изменяются расчётом', () => {
    const places = sample(6, 40).concat([place('bad', null, null)]);
    const input = {
        places: places, selectedIds: allIds(places), dates: DATES.slice(),
        start: { lat: START.lat, lng: START.lng, name: START.name }, options: {},
    };
    const before = JSON.stringify(input);
    planner.planRoute(input);
    assert.strictEqual(JSON.stringify(input), before);
});

// --- AC-005: что рядом ---------------------------------------------------

test('AC-005: рядом предлагается непосещённое место с точкой, минутами и днём', () => {
    const chosen = place('c1', 23.14, 113.28, { visit_minutes: 60 });
    const near = place('n1', 23.141, 113.281, { visit_minutes: 30 });
    const far = place('f1', 23.60, 113.90, { visit_minutes: 30 });
    const result = planner.planRoute({
        places: [chosen, near, far], selectedIds: ['c1'], dates: DATES, start: START,
    });

    assert.strictEqual(result.nearby.length, 1);
    const suggestion = result.nearby[0];
    assert.strictEqual(suggestion.place.id, 'n1');
    assert.strictEqual(suggestion.fromPlace.id, 'c1');
    assert.strictEqual(suggestion.date, DATES[0]);
    assert.strictEqual(suggestion.minutes, refMinutes(chosen, near));
    assert.ok(suggestion.minutes <= planner.DEFAULTS.nearbyMinutes);
});

test('AC-005: уже выбранное место в подсказку не попадает', () => {
    const places = sample(3, 30);
    const result = plan(places);
    const planned = result.days.reduce(function (acc, day) { return acc.concat(itemsOf(day)); }, []);
    result.nearby.forEach(function (suggestion) {
        assert.ok(!planned.includes(suggestion.place));
        assert.ok(!allIds(places).includes(suggestion.place.id));
    });
});

// --- AC-006: переполнение и простои --------------------------------------

test('AC-006: не влезшие места считаются и не попадают в dropped', () => {
    const places = sample(5, 60);
    const result = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: ['2026-04-01'],
        start: START, options: { dayEnd: '11:00' },
    });
    const notFitted = byType(result, 'not_fitted');

    // В окно 09:00–11:00 помещается одно место: дорога от отеля плюс час
    // посещения, второе уже не влезает. Остальные четыре — «не влезло».
    assert.strictEqual(result.dropped.length, 0);
    assert.strictEqual(notFitted.length, 1);
    assert.strictEqual(notFitted[0].value, 4);
    assert.match(notFitted[0].text, /Не влезло: 4/);
    assert.strictEqual(result.explain.totals.placesPlanned, 1);
    assert.strictEqual(result.explain.totals.placesNotFitted, 4);
});

test('AC-006: место дальше, чем весь день, объясняется окном дня', () => {
    const far = place('far', 40.0, 116.4, { visit_minutes: 60 });
    const result = planner.planRoute({
        places: [far], selectedIds: ['far'], dates: ['2026-04-01'], start: START,
    });
    const notFitted = byType(result, 'not_fitted');

    assert.strictEqual(result.days[0].items.length, 0);
    assert.strictEqual(result.dropped.length, 0);
    assert.strictEqual(notFitted.length, 1);
    assert.match(notFitted[0].text, /дольше окна дня/);
});

test('AC-006: простой в разреженном дне виден с величиной', () => {
    const result = plan([place('one', 23.13, 113.27, { visit_minutes: 30 })]);
    const idle = byType(result, 'idle');
    assert.ok(idle.length >= 1);
    assert.strictEqual(idle[0].date, DATES[0]);
    assert.ok(idle[0].value > planner.IDLE_WARN_MINUTES);
    assert.match(idle[0].text, /простой/);
});

test('AC-006: долгий переход помечается отдельно', () => {
    const here = place('a', 23.13, 113.27, { visit_minutes: 30 });
    const there = place('b', 23.45, 113.60, { visit_minutes: 30 });
    const result = planner.planRoute({
        places: [here, there], selectedIds: ['a', 'b'], dates: ['2026-04-01'], start: START,
    });
    const long = byType(result, 'long_travel');
    assert.strictEqual(long.length, 1);
    assert.ok(long[0].value > planner.LONG_TRAVEL_MINUTES);
    assert.strictEqual(long[0].date, '2026-04-01');
});

// --- AC-007: раскладка чисел ---------------------------------------------

test('AC-007: суммы раскладки сходятся с днями и с формулами', () => {
    const result = plan(sample(5, 45));
    result.explain.days.forEach(function (explain, index) {
        const day = result.days[index];
        const sum = function (parts) {
            return parts.reduce(function (acc, part) { return acc + part.minutes; }, 0);
        };
        assert.strictEqual(explain.travel.sum, day.travelMinutesTotal);
        assert.strictEqual(sum(explain.travel.parts), day.travelMinutesTotal);
        assert.strictEqual(explain.visits.sum, day.visitMinutesTotal);
        assert.strictEqual(sum(explain.visits.parts), day.visitMinutesTotal);
        assert.strictEqual(explain.idle.sum, day.idleMinutes);
        assert.strictEqual(explain.window.minutes - day.travelMinutesTotal - day.visitMinutesTotal,
            day.idleMinutes);
        assert.ok(explain.travel.formula.endsWith('= ' + day.travelMinutesTotal) ||
            explain.travel.formula === String(day.travelMinutesTotal));
        assert.match(explain.idle.formula, /^\d+ - \d+ - \d+ = \d+$/);
    });
    assert.strictEqual(result.explain.totals.travelMinutes,
        result.days[0].travelMinutesTotal + result.days[1].travelMinutesTotal);
});

test('AC-007: подставленные и оценочные величины помечены', () => {
    const places = [place('a', 23.13, 113.27), place('b', 23.15, 113.29, { visit_minutes: 25 })];
    const result = planner.planRoute({
        places: places, selectedIds: ['a', 'b'], dates: ['2026-04-01'], start: START,
    });
    const explain = result.explain.days[0];

    assert.strictEqual(explain.travel.assumed, true);
    explain.travel.parts.forEach(function (part) { assert.strictEqual(part.assumed, true); });
    assert.strictEqual(explain.visits.assumedCount, 1);
    assert.strictEqual(result.explain.assumptions.travelIsEstimate, true);
    assert.strictEqual(result.explain.assumptions.defaultVisitMinutes, 60);
    assert.ok(result.explain.assumptions.notes.some(function (note) { return note.includes('A1'); }));
    assert.ok(result.explain.assumptions.notes.some(function (note) { return note.includes('A3'); }));
});

test('AC-007: первый переход дня раскладки — от точки старта', () => {
    const day = plan(sample(3, 30)).days[0];
    const explain = plan(sample(3, 30)).explain.days[0];
    assert.strictEqual(explain.travel.parts[0].from, 'Отель');
    assert.strictEqual(explain.travel.parts[0].to, day.items[0].place.name);
    assert.strictEqual(explain.travel.parts.length, day.items.length);
});

// --- Граничные случаи (раздел 6 критериев) -------------------------------

test('граница: ноль отмеченных мест — дни пустые, ничего не отброшено', () => {
    const result = planner.planRoute({
        places: sample(4, 30), selectedIds: [], dates: DATES, start: START,
    });
    assert.strictEqual(result.days.length, 2);
    result.days.forEach(function (day) {
        assert.strictEqual(day.items.length, 0);
        assert.strictEqual(day.travelMinutesTotal, 0);
    });
    assert.strictEqual(result.dropped.length, 0);
    assert.strictEqual(byType(result, 'not_fitted').length, 0);
    assert.strictEqual(result.nearby.length, 0);
});

test('граница: одно место — один день с одной точкой и непустое «что рядом»', () => {
    const chosen = place('one', 23.14, 113.28, { visit_minutes: 60 });
    const other = place('two', 23.142, 113.282, { visit_minutes: 30 });
    const result = planner.planRoute({
        places: [chosen, other], selectedIds: ['one'], dates: ['2026-04-01'], start: START,
    });
    assert.strictEqual(result.days.length, 1);
    assert.strictEqual(result.days[0].items.length, 1);
    assert.strictEqual(result.days[0].items[0].travelMinutesToNext, null);
    assert.strictEqual(result.nearby.length, 1);
});

test('граница: место без visit_minutes получает подставленные 60 минут с пометкой', () => {
    const result = plan([place('a', 23.13, 113.27), place('b', 23.15, 113.29, { visit_minutes: 25 })]);
    const items = result.days[0].items;
    const plain = items.find(function (item) { return item.place.id === 'a'; });
    const known = items.find(function (item) { return item.place.id === 'b'; });

    assert.strictEqual(plain.minutes, 60);
    assert.strictEqual(plain.minutesAssumed, true);
    assert.strictEqual(known.minutes, 25);
    assert.strictEqual(known.minutesAssumed, false);
});

test('граница: поездка в один день — ровно один день, не ноль и не два', () => {
    const result = planner.planRoute({
        places: sample(3, 30), selectedIds: allIds(sample(3, 30)),
        dates: ['2026-04-01'], start: START,
    });
    assert.strictEqual(result.days.length, 1);
    assert.strictEqual(result.days[0].date, '2026-04-01');
});

test('граница: без точки старта время до первой точки не считается и об этом сказано', () => {
    const places = sample(4, 30);
    const result = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: DATES, start: null,
    });
    const day = result.days[0];

    assert.strictEqual(byType(result, 'no_start').length, 1);
    assert.strictEqual(result.explain.assumptions.startGiven, false);
    assert.strictEqual(day.items[0].arrive, '09:00');
    assert.strictEqual(day.travelMinutesTotal, refPath(itemsOf(day), null));
    assert.strictEqual(result.explain.days[0].travel.parts.length, day.items.length - 1);
});

test('граница: битая точка старта считается отсутствующей', () => {
    const places = sample(3, 30);
    const result = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: DATES, start: { lat: 'x', lng: 5 },
    });
    assert.strictEqual(byType(result, 'no_start').length, 1);
    assert.strictEqual(result.days[0].items[0].arrive, '09:00');
});

test('граница: все места в одной точке — дорога ноль, день не ломается', () => {
    const places = ['a', 'b', 'c'].map(function (id) {
        return place(id, 23.1, 113.25, { visit_minutes: 30 });
    });
    const result = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: ['2026-04-01'],
        start: { lat: 23.1, lng: 113.25, name: 'Отель' },
    });
    const day = result.days[0];

    assert.strictEqual(day.items.length, 3);
    assert.strictEqual(day.travelMinutesTotal, 0);
    assert.strictEqual(day.visitMinutesTotal, 90);
    assert.strictEqual(day.idleMinutes, 630);
    day.items.forEach(function (item) {
        assert.ok(Number.isFinite(item.minutes));
        assert.match(item.arrive, /^\d{2}:\d{2}$/);
    });
    assert.strictEqual(byType(result, 'long_travel').length, 0);
});

test('граница: дат нет вовсе — план пуст, а места числятся не влезшими', () => {
    const places = sample(3, 30);
    const result = planner.planRoute({
        places: places, selectedIds: allIds(places), dates: [], start: START,
    });
    assert.strictEqual(result.days.length, 0);
    assert.strictEqual(byType(result, 'not_fitted')[0].value, 3);
});

test('повторённый в списке id не задваивает место в плане', () => {
    const places = sample(3, 30);
    const result = planner.planRoute({
        places: places.concat(places), selectedIds: allIds(places).concat(allIds(places)),
        dates: DATES, start: START,
    });
    const planned = result.days.reduce(function (acc, day) { return acc.concat(itemsOf(day)); }, []);
    assert.strictEqual(planned.length, 3);
});
