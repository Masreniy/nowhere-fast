/**
 * Проверка слоя доступа к данным.
 *
 * Эти тесты появились после того, как в `assets/js/api.js` нашлись две ошибки,
 * которые нельзя было увидеть глазами — только выполнив код:
 *
 *   1. `createPlace` не передавал `author_id`, которого требует политика
 *      `places_insert_own`. Форма добавления места не сработала бы и после
 *      появления входа: RLS отклонил бы запрос, а причина выглядела бы
 *      как «что-то не так с базой».
 *   2. `getCityByName` пускал `%`, `_` и `*` из адресной строки прямо в `ilike`,
 *      где они значат «любой символ». Ссылка `city.html?city=%` открывала
 *      первый попавшийся город, и человек считал, что попал куда хотел.
 *
 * Обе починены. Тесты держат их закрытыми.
 *
 * Сеть здесь не нужна и не используется: клиент Supabase подменяется заглушкой,
 * которая записывает, какие вызовы к ней сделали. Проверяется наш код,
 * а не чужая библиотека.
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
 * Поднимает документ с подменённым клиентом Supabase и загружает api.js.
 *
 * @param {Object} [options]
 *   session — что вернёт auth.getSession(): объект сессии или null
 *   rows    — что «лежит в таблицах»: { имя_таблицы: [строки] }
 * @returns {{ win: Window, calls: Array }} calls — журнал обращений к клиенту
 */
function setup(options) {
    const opts = options || {};
    const session = opts.session === undefined ? null : opts.session;
    const rows = opts.rows || {};

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
    });
    const win = dom.window;
    const calls = [];

    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'));
    // i18n нужен слою данных: он сверяет код языка со списком NF.i18n.LANGS.
    // На всех четырёх страницах i18n подключён раньше api.js, так что здесь
    // повторяется тот же порядок, а не создаётся удобная выдумка.
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/i18n-strings.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/i18n.js'), 'utf8'));

    win.supabase = {
        createClient: function () {
            function from(table) {
                const builder = {};
                ['select', 'order', 'limit', 'ilike', 'eq', 'in', 'insert', 'delete', 'gte', 'not']
                    .forEach(function (method) {
                        builder[method] = function () {
                            calls.push({ table: table, method: method, args: Array.from(arguments) });
                            return builder;
                        };
                    });

                function first() {
                    calls.push({ table: table, method: 'resolve-one', args: [] });
                    return Promise.resolve({ data: (rows[table] || [])[0] || null, error: null });
                }
                builder.maybeSingle = first;
                builder.single = first;
                builder.then = function (onOk, onFail) {
                    calls.push({ table: table, method: 'resolve-many', args: [] });
                    return Promise.resolve({ data: rows[table] || [], error: null }).then(onOk, onFail);
                };
                return builder;
            }

            return {
                from: from,
                rpc: function (name, args) {
                    calls.push({ table: null, method: 'rpc', args: [name, args] });
                    return Promise.resolve({ data: rows[name] || [], error: null });
                },
                auth: {
                    getSession: function () {
                        calls.push({ table: null, method: 'getSession', args: [] });
                        return Promise.resolve({ data: { session: session }, error: null });
                    },
                },
            };
        },
    };

    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/api.js'), 'utf8'));
    return { win: win, calls: calls };
}

/** Аргумент, с которым позвали insert. */
function insertedRow(calls) {
    const call = calls.find(function (c) { return c.method === 'insert'; });
    return call ? call.args[0] : null;
}

// --- Поиск города по имени ---------------------------------------------------

test('имя города со знаками шаблона не уходит в запрос', async () => {
    // %, _ и * для ilike — это «любой символ». Города с такими именами не бывает,
    // а вот ссылка с ними приходит от кого угодно.
    for (const name of ['%', '_', '*', 'Гуан%', 'Гуанчжоу_', '%%%']) {
        const { win, calls } = setup({ rows: { cities: [{ id: 'c1', name: 'Гуанчжоу' }] } });
        const city = await win.NF.api.getCityByName(name);

        assert.strictEqual(city, null, 'шаблон «' + name + '» вернул город');
        assert.strictEqual(
            calls.some(function (c) { return c.table === 'cities'; }),
            false,
            'по шаблону «' + name + '» всё-таки сходили в базу'
        );
    }
});

test('обычное имя города по-прежнему ищется', async () => {
    const { win, calls } = setup({ rows: { cities: [{ id: 'c1', name: 'Гуанчжоу' }] } });
    const city = await win.NF.api.getCityByName('Гуанчжоу');

    assert.strictEqual(city.id, 'c1');
    assert.ok(calls.some(function (c) { return c.method === 'ilike'; }), 'запрос не выполнялся');
});

// --- Создание места ----------------------------------------------------------

test('без входа место не создаётся и запрос не отправляется', async () => {
    const { win, calls } = setup({ session: null });

    await assert.rejects(
        () => win.NF.api.createPlace({ city_id: 'c1', name: 'Парк', lat: 23.1, lng: 113.2 }),
        function (error) {
            assert.strictEqual(error.code, 'NO_SESSION', 'код ошибки не тот');
            return true;
        }
    );

    assert.strictEqual(insertedRow(calls), null, 'insert всё-таки ушёл в базу');
});

test('при создании места подставляется author_id из сессии', async () => {
    const { win, calls } = setup({
        session: { user: { id: 'user-42' } },
        rows: { places: [{ id: 'p1' }] },
    });

    await win.NF.api.createPlace({ city_id: 'c1', name: 'Парк', lat: 23.1, lng: 113.2 });

    // Политика places_insert_own требует author_id = auth.uid().
    // Без этого поля запрос отклоняется RLS, и причина неочевидна.
    assert.strictEqual(insertedRow(calls).author_id, 'user-42');
});

test('место создаётся черновиком, даже если страница просит опубликовать', async () => {
    const { win, calls } = setup({
        session: { user: { id: 'user-42' } },
        rows: { places: [{ id: 'p1' }] },
    });

    await win.NF.api.createPlace({
        city_id: 'c1', name: 'Парк', lat: 23.1, lng: 113.2,
        is_published: true,   // именно так делала админка до 16.09.2026
    });

    assert.strictEqual(insertedRow(calls).is_published, false,
        'новое место опубликовалось молча');
});

test('остальные поля места доходят до базы без изменений', async () => {
    const { win, calls } = setup({
        session: { user: { id: 'user-42' } },
        rows: { places: [{ id: 'p1' }] },
    });

    await win.NF.api.createPlace({
        city_id: 'c1', name: 'Парк Юэсю', name_local: '越秀公园',
        lat: 23.14, lng: 113.2644, visit_minutes: 90, source: 'manual',
    });

    const row = insertedRow(calls);
    assert.strictEqual(row.name_local, '越秀公园');
    assert.strictEqual(row.lat, 23.14);
    assert.strictEqual(row.visit_minutes, 90);
});

// --- Сессия ------------------------------------------------------------------

test('currentUserId различает вход и его отсутствие', async () => {
    const anon = setup({ session: null });
    assert.strictEqual(await anon.win.NF.api.currentUserId(), null);

    const user = setup({ session: { user: { id: 'user-42' } } });
    assert.strictEqual(await user.win.NF.api.currentUserId(), 'user-42');
});

// --- Справочник стран и городов ----------------------------------------------
//
// Эти три функции однажды отсутствовали в api.js целиком, а страница их звала.
// Ручная проверка в браузере ошибку НЕ поймала: слой данных там подменялся
// заглушкой, и заглушка сама подставляла недостающие функции — проверка
// проверяла себя, а не продукт. Нашло только чтение кода на ревью.
//
// Отсюда первая ось: имена, которые зовёт страница, и имена, которые отдаёт
// слой данных, должны сходиться, и расхождение обязано ломать тесты, а не
// страницу у человека.

test('страница глобуса зовёт только то, что слой данных отдаёт', () => {
    const api = setup().win.NF.api;
    const source = ['page.js', 'page-data.js', 'page-search.js', 'page-card.js',
        'page-tools.js', 'page-labels.js']
        .map(function (name) {
            return fs.readFileSync(path.join(ROOT, 'assets/js/globe', name), 'utf8');
        })
        .join('\n');

    const called = [];
    const pattern = /NF\.api\.([a-zA-Z0-9_]+)/g;
    let found = pattern.exec(source);
    while (found) {
        if (called.indexOf(found[1]) === -1) called.push(found[1]);
        found = pattern.exec(source);
    }

    assert.ok(called.length > 0,
        'страница не обращается к слою данных — проверка потеряла смысл');
    called.forEach(function (name) {
        assert.strictEqual(typeof api[name], 'function',
            'страница зовёт NF.api.' + name + ', а слой данных такого не отдаёт');
    });
});

test('справочник стран просит контур — без него нечего рисовать', async () => {
    const { win, calls } = setup();
    await win.NF.api.listCountries();
    const select = calls.find(function (c) { return c.method === 'select'; });
    assert.strictEqual(select.table, 'countries', 'запрошена не та таблица');
    assert.ok(/outline/.test(select.args[0]), 'контур не запрошен: ' + select.args[0]);
    assert.ok(/names/.test(select.args[0]), 'названия на языках не запрошены');
});

test('справочник городов отбирает по населению и НЕ тянет написания', async () => {
    const { win, calls } = setup();
    await win.NF.api.listGeoCities(50000);
    const select = calls.find(function (c) { return c.method === 'select'; });
    const gte = calls.find(function (c) { return c.method === 'gte'; });
    assert.strictEqual(select.table, 'geo_cities', 'запрошена не та таблица');
    // Колонка names хранит десять языков, человеку нужен один. Замерено:
    // 260 КБ после сжатия против 42. Раньше этот тест требовал обратного —
    // и был прав ровно до тех пор, пока написания в браузере не появились
    // и не выяснилось, что их никто не читает.
    assert.ok(!/names/.test(select.args[0]),
        'написания тянутся вместе со справочником: ' + select.args[0]);
    assert.deepStrictEqual(gte.args, ['population', 50000], 'порог населения не применён');
});

test('написания приходят отдельно и ровно на один язык', async () => {
    const { win, calls } = setup();
    await win.NF.api.listCityNames('ru');
    const rpc = calls.find(function (c) { return c.method === 'rpc'; });
    assert.ok(rpc, 'запрос написаний не ушёл');
    // Сравнение по полям, а не deepStrictEqual: объект создан в другом
    // realm (jsdom), и строгое сравнение спорит о прототипе, а не о данных.
    assert.strictEqual(rpc.args[0], 'geo_city_names');
    assert.strictEqual(rpc.args[1].lang, 'ru');
});

test('неизвестный код языка не уходит в базу молча', async () => {
    // Опечатка вернула бы пустой список, и страница осталась бы латиницей
    // без единого признака поломки. Лучше упасть здесь.
    const { win } = setup();
    await assert.rejects(function () { return win.NF.api.listCityNames('zz'); },
        /неизвестный код языка/);
});

test('отрицательный порог населения не уходит в запрос как есть', async () => {
    const { win, calls } = setup();
    await win.NF.api.listGeoCities(-1);
    const gte = calls.find(function (c) { return c.method === 'gte'; });
    assert.deepStrictEqual(gte.args, ['population', 0], 'мусорный порог не приведён к нулю');
});

test('города продукта без координат не приезжают — ставить их на шар некуда', async () => {
    const { win, calls } = setup();
    await win.NF.api.listCitiesWithContent();
    const select = calls.find(function (c) { return c.method === 'select'; });
    const nulls = calls.filter(function (c) { return c.method === 'not'; })
        .map(function (c) { return c.args[0]; });
    assert.strictEqual(select.table, 'cities', 'запрошена не та таблица');
    assert.ok(/country_code/.test(select.args[0]), 'связка со справочником не запрошена');
    assert.deepStrictEqual(nulls, ['lat', 'lng'], 'города без координат не отсеяны');
});
