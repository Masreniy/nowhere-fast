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

    win.supabase = {
        createClient: function () {
            function from(table) {
                const builder = {};
                ['select', 'order', 'limit', 'ilike', 'eq', 'in', 'insert', 'delete']
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
