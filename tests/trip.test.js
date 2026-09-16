/**
 * Проверка состояния поездки.
 *
 * Главное, что здесь закрывается, — правило старшинства: присланная ссылка
 * должна побеждать то, что лежит в браузере у получателя. Ошибка в эту сторону
 * незаметна: человек открывает чужую ссылку и видит свою прошлую поездку,
 * причём обе выглядят правдоподобно.
 *
 * Второе — устойчивость к мусору. Значения приходят из адресной строки,
 * то есть от кого угодно, и страница не имеет права падать.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/**
 * jsdom живёт в своей области видимости: массив, созданный внутри страницы,
 * для strictEqual не равен массиву, созданному здесь, даже при одинаковом
 * содержимом. Сравниваем содержимое, а не происхождение объекта.
 */
function plain(value) { return Array.prototype.slice.call(value); }
const CITY = '553817e4-d2be-4925-86ab-d0a832acbe38';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

/** Поднимает документ с работающим (или намеренно сломанным) хранилищем. */
function setup(options) {
    const opts = options || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only', url: 'https://example.com/city.html',
    });
    const win = dom.window;

    if (opts.brokenStorage) {
        Object.defineProperty(win, 'localStorage', {
            configurable: true,
            get() { throw new Error('хранилище недоступно'); },
        });
    }

    // Порядок важен и повторяет порядок подключения в страницах: проверку дат
    // ведёт NF.dates, и trip.js на неё опирается, а не держит свою копию.
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/dates.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/trip.js'), 'utf8'));
    return win;
}

// --- Правило старшинства -----------------------------------------------------

test('ссылка старше локального хранилища', () => {
    const win = setup();
    // в браузере уже лежит своя поездка
    win.NF.trip.save({ cityId: CITY, from: '2026-01-01', to: '2026-01-05',
                       start: null, selected: [P1] });

    // пришла чужая ссылка с другой поездкой
    const trip = win.NF.trip.resolve('?id=' + CITY + '&from=2026-04-01&to=2026-04-03&sel=' + P2);

    assert.strictEqual(trip.from, '2026-04-01', 'взята дата из хранилища, а не из ссылки');
    assert.deepStrictEqual(plain(trip.selected), [P2], 'взяты места из хранилища, а не из ссылки');
});

test('без параметров в ссылке берётся сохранённая поездка', () => {
    const win = setup();
    win.NF.trip.save({ cityId: CITY, from: '2026-01-01', to: '2026-01-05',
                       start: null, selected: [P1] });

    const trip = win.NF.trip.resolve('?id=' + CITY);

    assert.strictEqual(trip.from, '2026-01-01');
    assert.deepStrictEqual(plain(trip.selected), [P1]);
});

// --- Мусор из адресной строки ------------------------------------------------

test('мусорные значения отбрасываются молча', () => {
    const win = setup();
    const trip = win.NF.trip.resolve(
        '?id=' + CITY + '&from=вчера&to=2026-13-45&sel=не-uuid,,' + P1 + '&start=北,南');

    assert.strictEqual(trip.from, null);
    assert.strictEqual(trip.to, null, 'несуществующая дата принята');
    assert.deepStrictEqual(plain(trip.selected), [P1], 'в выбор попал мусор');
    assert.strictEqual(trip.start, null, 'координаты из букв приняты');
});

test('проверка дат — та же, что в NF.dates, без своей копии', () => {
    const win = setup();

    // Ровно то расхождение, которое нашло ревью 16.09.2026: своя проверка
    // в trip.js принимала «0000-01-01», а NF.dates её отвергал. Человек уходил
    // на страницу плана без единого предупреждения и получал пустой план,
    // потому что список дат поездки оказывался пустым.
    const trip = win.NF.trip.fromQuery('?id=' + CITY + '&from=0000-01-01&to=0000-01-05');
    assert.strictEqual(trip.from, null, 'дата года 0000 принята');
    assert.strictEqual(win.NF.dates.isValidISO('0000-01-01'), false);

    // И наоборот: всё, что NF.dates считает датой, поездка тоже обязана принять.
    for (const good of ['2026-04-01', '2028-02-29', '1999-12-31']) {
        assert.strictEqual(win.NF.dates.isValidISO(good), true, 'NF.dates отверг ' + good);
        assert.strictEqual(win.NF.trip.fromQuery('?from=' + good).from, good,
            'поездка отвергла дату, которую NF.dates принял: ' + good);
    }
});

test('идентификатор города не той формы не принимается', () => {
    const win = setup();
    for (const bad of ['не-uuid', '../../etc', '1', '%27']) {
        assert.strictEqual(win.NF.trip.fromQuery('?id=' + bad).cityId, null,
            'принят идентификатор ' + bad);
    }
    assert.strictEqual(win.NF.trip.fromQuery('?id=' + CITY).cityId, CITY);
});

test('координаты вне допустимого диапазона не принимаются', () => {
    const win = setup();
    for (const bad of ['91,113', '23,181', '-91,-181']) {
        const trip = win.NF.trip.fromQuery('?id=' + CITY + '&start=' + bad);
        assert.strictEqual(trip.start, null, 'принята точка ' + bad);
    }
});

test('перепутанные местами даты выправляются', () => {
    const win = setup();
    const trip = win.NF.trip.fromQuery('?id=' + CITY + '&from=2026-04-05&to=2026-04-01');
    assert.strictEqual(trip.from, '2026-04-01');
    assert.strictEqual(trip.to, '2026-04-05');
});

test('повторы в списке мест схлопываются', () => {
    const win = setup();
    const trip = win.NF.trip.fromQuery('?id=' + CITY + '&sel=' + [P1, P2, P1].join(','));
    assert.deepStrictEqual(plain(trip.selected), [P1, P2]);
});

// --- Ссылка туда и обратно ---------------------------------------------------

test('поездка переживает запись в ссылку и чтение обратно', () => {
    const win = setup();
    const before = {
        cityId: CITY, from: '2026-04-01', to: '2026-04-03',
        start: { lat: 23.1291, lng: 113.2644, name: 'Отель' }, selected: [P1, P2],
    };
    const after = win.NF.trip.fromQuery('?' + win.NF.trip.toQuery(before));

    assert.strictEqual(after.from, before.from);
    assert.strictEqual(after.to, before.to);
    assert.deepStrictEqual(plain(after.selected), plain(before.selected));
    assert.strictEqual(after.start.lat, 23.1291);
    assert.strictEqual(after.start.name, 'Отель');
});

test('точка старта без названия не ломает ссылку', () => {
    const win = setup();
    const after = win.NF.trip.fromQuery('?' + win.NF.trip.toQuery({
        cityId: CITY, from: null, to: null,
        start: { lat: 23.1, lng: 113.2, name: null }, selected: [],
    }));
    assert.strictEqual(after.start.lat, 23.1);
    assert.strictEqual(after.start.name, null);
});

// --- Отметки -----------------------------------------------------------------

test('отметка не меняет исходную поездку', () => {
    const win = setup();
    const before = win.NF.trip.empty(CITY);
    const after = win.NF.trip.toggle(before, P1);

    assert.deepStrictEqual(plain(before.selected), [], 'исходная поездка изменилась');
    assert.deepStrictEqual(plain(after.selected), [P1]);
    assert.strictEqual(win.NF.trip.isSelected(after, P1), true);
    assert.strictEqual(win.NF.trip.isSelected(before, P1), false);
});

test('повторная отметка снимает место', () => {
    const win = setup();
    const trip = win.NF.trip.toggle(win.NF.trip.toggle(win.NF.trip.empty(CITY), P1), P1);
    assert.deepStrictEqual(plain(trip.selected), []);
});

test('больше предела отметить нельзя', () => {
    const win = setup();
    let trip = win.NF.trip.empty(CITY);
    for (let i = 0; i < win.NF.trip.MAX_SELECTED + 5; i++) {
        // подставные, но валидные по форме идентификаторы
        const id = String(i).padStart(8, '0') + '-0000-4000-8000-000000000000';
        trip = win.NF.trip.toggle(trip, id);
    }
    assert.strictEqual(trip.selected.length, win.NF.trip.MAX_SELECTED);
});

// --- Чего не хватает для расчёта ---------------------------------------------

test('пустая поездка честно перечисляет, чего не хватает', () => {
    const win = setup();
    const gaps = win.NF.trip.missing(win.NF.trip.empty(CITY));
    assert.strictEqual(gaps.length, 2);
    assert.match(gaps.join(' '), /даты/);
    assert.match(gaps.join(' '), /место/);
});

test('полная поездка не жалуется', () => {
    const win = setup();
    const gaps = win.NF.trip.missing({
        cityId: CITY, from: '2026-04-01', to: '2026-04-03', start: null, selected: [P1],
    });
    assert.deepStrictEqual(plain(gaps), []);
});

// --- Недоступное хранилище ---------------------------------------------------

test('без доступа к хранилищу страница продолжает работать', () => {
    const win = setup({ brokenStorage: true });

    // приватный режим, запрет сторонних данных, открытие файла с диска
    assert.strictEqual(win.NF.trip.save({ cityId: CITY, selected: [P1] }), false);
    assert.deepStrictEqual(plain(win.NF.trip.load(CITY).selected), []);
    assert.strictEqual(win.NF.trip.forget(CITY), false);

    // а ссылка при этом читается как ни в чём не бывало
    const trip = win.NF.trip.resolve('?id=' + CITY + '&from=2026-04-01&to=2026-04-02&sel=' + P1);
    assert.deepStrictEqual(plain(trip.selected), [P1]);
});
