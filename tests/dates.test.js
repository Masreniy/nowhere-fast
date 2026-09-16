/**
 * Проверка календарных меток поездки.
 *
 * Эти тесты закрывают AC-010 из docs/ACCEPTANCE-PLANNER.md: даты живут
 * в трёх поясах — браузер пользователя, город поездки, UTC от Postgres —
 * и не уезжают на сутки. Ошибка здесь не падает с исключением, а тихо
 * сдвигает первый день плана, поэтому единственный способ её поймать —
 * подставить фиксированный момент и сравнить числа.
 *
 * Пояс браузера задан явно, до первого обращения к Date: иначе тест «сегодня
 * у пользователя» зеленел бы или краснел в зависимости от машины, на которой
 * его запустили. node --test выполняет каждый файл в отдельном процессе,
 * поэтому соседние тесты этой подменой не задеты.
 *
 * Запуск:  npm test
 */
process.env.TZ = 'Europe/Moscow'; // UTC+3, пояс пользователя из сценария AC-010

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/** Поднимает чистый документ и загружает в него dates.js. */
function setup() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
    });
    const win = dom.window;
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/dates.js'), 'utf8'));
    return win.NF.dates;
}

/**
 * Копирует массив из окна jsdom в текущий realm.
 *
 * deepStrictEqual сверяет ещё и прототип, а массив, созданный внутри окна,
 * наследует чужой Array — сравнение с обычным литералом падает, хотя
 * содержимое совпадает. Копия убирает эту ложную разницу.
 */
function list(value) {
    return value === null ? null : Array.from(value);
}

// --- AC-010: три пояса -------------------------------------------------------

test('вечером у пользователя в городе поездки уже завтра', () => {
    const dates = setup();

    // Сценарий AC-010: 1 апреля, 21:30 у пользователя в UTC+3.
    // В Шанхае (UTC+8) в этот момент 2 апреля, 02:30.
    const now = new Date('2026-04-01T21:30:00+03:00');

    assert.strictEqual(dates.todayLocalISO(now), '2026-04-01', 'дата пользователя уехала');
    assert.strictEqual(dates.todayInCityISO('Asia/Shanghai', now), '2026-04-02',
        'в городе поездки должно быть уже 2 апреля');
});

test('момент из Postgres даёт те же даты, что и момент с местным сдвигом', () => {
    const dates = setup();

    // Третий пояс сценария: база отдаёт timestamptz в UTC. Это тот же момент,
    // записанный иначе, — значит и дни должны получиться те же.
    const fromPostgres = new Date('2026-04-01T18:30:00+00:00');

    assert.strictEqual(dates.todayLocalISO(fromPostgres), '2026-04-01');
    assert.strictEqual(dates.todayInCityISO('Asia/Shanghai', fromPostgres), '2026-04-02');
});

test('после полуночи «сегодня» не откатывается на вчерашнюю дату UTC', () => {
    const dates = setup();

    // Ровно та ошибка, ради которой модуль заведён: в 01:30 ночи по Москве
    // в UTC ещё вчера (22:30 первого апреля). Если «сегодня» брать из UTC,
    // пользователь получит поездку, начинающуюся вчера, и первый день плана
    // уедет на сутки. Момент из сценария AC-010 этой ошибки не показывает —
    // 21:30 у UTC+3 и в UTC приходятся на одно число.
    const afterMidnight = new Date('2026-04-02T01:30:00+03:00');

    assert.strictEqual(dates.todayLocalISO(afterMidnight), '2026-04-02',
        '«сегодня» у пользователя посчитано в UTC, а не по его часам');
    // В Шанхае в этот момент 06:30 того же дня.
    assert.strictEqual(dates.todayInCityISO('Asia/Shanghai', afterMidnight), '2026-04-02');
});

test('день плана не зависит от пояса браузера', () => {
    const dates = setup();

    // «Не должно: сдвигать день плана при смене пояса браузера» (AC-010).
    // Календарная метка — не момент времени, у неё нет пояса, поэтому
    // арифметика над ней обязана давать один и тот же ответ везде.
    const saved = process.env.TZ;
    const results = [];
    for (const tz of ['Europe/Moscow', 'Asia/Shanghai', 'America/Los_Angeles', 'UTC']) {
        process.env.TZ = tz;
        results.push(setup().isoPlusDays('2026-04-01', 2));
    }
    process.env.TZ = saved;

    assert.deepStrictEqual(results, ['2026-04-03', '2026-04-03', '2026-04-03', '2026-04-03']);
});

test('без часового пояса города показывается дата пользователя', () => {
    const dates = setup();
    const now = new Date('2026-04-01T21:30:00+03:00');

    // cities.timezone заполнен не у всех городов — падать из-за этого нельзя.
    assert.strictEqual(dates.todayInCityISO(null, now), '2026-04-01');
    assert.strictEqual(dates.todayInCityISO('', now), '2026-04-01');
    assert.strictEqual(dates.todayInCityISO('Нет/Такого', now), '2026-04-01');
});

test('«сейчас» можно не передавать', () => {
    const dates = setup();
    assert.ok(dates.isValidISO(dates.todayLocalISO()), 'todayLocalISO без аргумента');
    assert.ok(dates.isValidISO(dates.todayInCityISO('Asia/Shanghai')), 'todayInCityISO без аргумента');
});

// --- Длина поездки -----------------------------------------------------------

test('поездка с 1 по 3 апреля — три дня, а не два', () => {
    const dates = setup();
    assert.strictEqual(dates.tripDays('2026-04-01', '2026-04-03'), 3);
    assert.deepStrictEqual(
        list(dates.listTripDates('2026-04-01', '2026-04-03')),
        ['2026-04-01', '2026-04-02', '2026-04-03']
    );
});

test('поездка в один день — ровно один день, не ноль и не два', () => {
    const dates = setup();
    assert.strictEqual(dates.tripDays('2026-04-01', '2026-04-01'), 1);
    assert.deepStrictEqual(list(dates.listTripDates('2026-04-01', '2026-04-01')), ['2026-04-01']);
});

test('перепутанные местами границы не дают пустую или отрицательную поездку', () => {
    const dates = setup();
    assert.strictEqual(dates.tripDays('2026-04-03', '2026-04-01'), 1);
    assert.deepStrictEqual(list(dates.listTripDates('2026-04-03', '2026-04-01')), ['2026-04-03']);
});

test('поездка длиной с год не разворачивается в массив', () => {
    const dates = setup();
    // Опечатка в годе не должна подвешивать вкладку.
    assert.strictEqual(dates.listTripDates('2026-04-01', '2226-04-01'), null);
});

// --- Арифметика --------------------------------------------------------------

test('прибавление дней переходит через конец месяца и через конец года', () => {
    const dates = setup();
    assert.strictEqual(dates.isoPlusDays('2026-04-30', 1), '2026-05-01');
    assert.strictEqual(dates.isoPlusDays('2026-01-31', 1), '2026-02-01');
    assert.strictEqual(dates.isoPlusDays('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(dates.isoPlusDays('2027-01-01', -1), '2026-12-31');
});

test('високосный год: у 2028 февраля двадцать девять дней', () => {
    const dates = setup();
    assert.strictEqual(dates.isoPlusDays('2028-02-28', 1), '2028-02-29');
    assert.strictEqual(dates.isoPlusDays('2028-02-29', 1), '2028-03-01');
    // 2026-й невисокосный — там 28 февраля сразу переходит в март.
    assert.strictEqual(dates.isoPlusDays('2026-02-28', 1), '2026-03-01');
    assert.strictEqual(dates.tripDays('2028-02-01', '2028-03-01'), 30);
});

test('переход на летнее время не съедает и не добавляет день', () => {
    const dates = setup();
    // В Европе часы переводят в ночь на 29 марта 2026: местные сутки длятся
    // 23 часа. В UTC-арифметике их по-прежнему 24, поэтому разница целая.
    assert.strictEqual(dates.isoDiffDays('2026-03-28', '2026-03-30'), 2);
    assert.strictEqual(dates.tripDays('2026-03-28', '2026-03-30'), 3);
    // И обратный перевод, в ночь на 25 октября 2026 — сутки в 25 часов.
    assert.strictEqual(dates.isoDiffDays('2026-10-24', '2026-10-26'), 2);
});

test('разница в днях знает направление', () => {
    const dates = setup();
    assert.strictEqual(dates.isoDiffDays('2026-04-01', '2026-04-03'), 2);
    assert.strictEqual(dates.isoDiffDays('2026-04-03', '2026-04-01'), -2);
    assert.strictEqual(dates.isoDiffDays('2026-04-01', '2026-04-01'), 0);
});

// --- Валидация ---------------------------------------------------------------

test('несуществующие и кривые даты отвергаются', () => {
    const dates = setup();
    const bad = [
        '2026-02-31', '2026-13-01', '2026-00-10', '2026-04-00', '2026-04-31',
        '2027-02-29',           // не високосный
        '26-04-01', '2026-4-1', '2026/04/01', '01.04.2026',
        '2026-04-01T00:00:00Z', // момент времени, а не календарная метка
        '', '   ', null, undefined, {}, [], 42, NaN,
    ];
    for (const value of bad) {
        assert.strictEqual(dates.isValidISO(value), false, 'принята дата: ' + String(value));
        assert.strictEqual(dates.isoPlusDays(value, 1), null, 'арифметика на: ' + String(value));
        assert.strictEqual(dates.tripDays(value, '2026-04-03'), null, 'поездка от: ' + String(value));
        assert.strictEqual(dates.formatHuman(value), null, 'показ: ' + String(value));
    }
});

test('настоящие даты принимаются', () => {
    const dates = setup();
    for (const value of ['2026-04-01', '2028-02-29', '2026-12-31', '2026-01-01']) {
        assert.strictEqual(dates.isValidISO(value), true, 'отвергнута дата: ' + value);
    }
});

test('нечисловой сдвиг не превращает дату в мусор', () => {
    const dates = setup();
    assert.strictEqual(dates.isoPlusDays('2026-04-01', 'завтра'), null);
    assert.strictEqual(dates.isoPlusDays('2026-04-01', NaN), null);
    assert.strictEqual(dates.isoPlusDays('2026-04-01', Infinity), null);
});

// --- Показ человеку ----------------------------------------------------------

test('дата показывается по-русски и в родительном падеже', () => {
    const dates = setup();
    assert.strictEqual(dates.formatHuman('2026-04-01'), '1 апреля');
    assert.strictEqual(dates.formatHuman('2026-01-09'), '9 января');
    assert.strictEqual(dates.formatHuman('2026-05-31'), '31 мая');
    assert.strictEqual(dates.formatHuman('2026-12-25'), '25 декабря');
    // Ведущий ноль дня — это формат хранения, а не то, что читает человек.
    assert.strictEqual(dates.formatHuman('2026-08-05'), '5 августа');
});

// --- AC-010: греп ------------------------------------------------------------

test('текущий момент нигде не превращается в дату через UTC', () => {
    // Прямая проверка из AC-010: «ни одна показанная дата не получена
    // из new Date().toISOString()». Именно эта связка и ошибочна — она берёт
    // текущий момент и показывает его UTC-дату, которая у пользователя
    // ночью ещё вчерашняя, а в городе поездки уже завтрашняя.
    //
    // Проверяется связка, а не слово: toISOString над ЯВНО заданным моментом
    // (например, разбор строки «2026-04-01T00:00:00Z» обратно) UTC-датой
    // никого не обманывает и запретом не покрыт.
    const forbidden = /new\s+Date\s*\(\s*\)\s*\.\s*toISOString/;

    const jsDir = path.join(ROOT, 'assets/js');
    const files = fs.readdirSync(jsDir)
        .filter(function (name) { return name.endsWith('.js'); })
        .map(function (name) { return path.join(jsDir, name); })
        .concat(['index.html', 'city.html', 'admin.html'].map(function (name) {
            return path.join(ROOT, name);
        }));

    for (const file of files) {
        assert.strictEqual(forbidden.test(fs.readFileSync(file, 'utf8')), false,
            'дата из текущего момента в UTC: ' + path.relative(ROOT, file));
    }
});
