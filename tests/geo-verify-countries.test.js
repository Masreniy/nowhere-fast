/**
 * Проверка сверки стран — прежде всего распаковки очертаний.
 *
 * Зачем этот тест. `unpackOutline` — построчный перевод SQL-функции
 * `nf_unpack_outline` на JavaScript. Два одинаковых алгоритма в двух языках
 * расходятся тихо: в базе окажется один берег, в сверке другой, и сверка
 * начнёт ругаться на здоровые данные — а на такую сверку через неделю
 * перестают смотреть.
 *
 * Самое хрупкое место — долгота. Она копится дельтами и **заворачивается**
 * через антимеридиан по формуле с двойным остатком; ошибка там даёт стране
 * второй берег на другой стороне глобуса. Поэтому заворот проверяется
 * отдельно, а не «заодно».
 *
 * Кроме того: широта и долгота обнуляются в начале каждого кольца, а индекс
 * в массиве дельт — нет. Перепутать эти два правила — значит получить
 * правдоподобный, но неверный контур.
 *
 * Сверх этого: распаковка проверена на всех 234 странах против живой базы —
 * 32 323 точки, обе суммы совпали до единицы. Здесь остаются случаи,
 * которые в настоящих данных встречаются редко и потому легко ломаются
 * незаметно.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const verify = require('../tools/geo/verify-countries.js');

/** Собирает base64 из int16 little-endian — так же, как это делает генератор. */
function packed(values) {
    const buffer = Buffer.alloc(values.length * 2);
    values.forEach(function (value, index) {
        buffer.writeInt16LE(value, index * 2);
    });
    return buffer.toString('base64');
}

test('дельты складываются, точки считаются', function () {
    // Долготы: 100, 150, 130. Широты: 200, 190, 195.
    const totals = verify.unpackOutline([[3]], packed([100, 50, -20]), packed([200, -10, 5]));
    assert.strictEqual(totals.points, 3);
    assert.strictEqual(totals.sumLng, 100 + 150 + 130);
    assert.strictEqual(totals.sumLat, 200 + 190 + 195);
});

test('долгота заворачивается через антимеридиан, широта — нет', function () {
    // 17900 + 17900 = 35800, это уже за +180°: должно стать -200 (то есть -2°).
    const totals = verify.unpackOutline([[2]], packed([17900, 17900]), packed([0, 0]));
    assert.strictEqual(totals.sumLng, 17900 + -200);
    // Широта складывается как есть: полюс не заворачивается.
    const north = verify.unpackOutline([[2]], packed([0, 0]), packed([8000, 1000]));
    assert.strictEqual(north.sumLat, 8000 + 9000);
});

test('заворот работает и в минус', function () {
    const totals = verify.unpackOutline([[2]], packed([-17900, -17900]), packed([0, 0]));
    assert.strictEqual(totals.sumLng, -17900 + 200);
});

test('каждое кольцо начинается с нуля, а дельты читаются дальше по списку', function () {
    // Два кольца по две точки. Если бы координата не обнулялась между
    // кольцами, второе кольцо уехало бы на сумму первого.
    const totals = verify.unpackOutline(
        [[2], [2]],
        packed([10, 5, 700, 3]),
        packed([20, 1, 800, 2])
    );
    assert.strictEqual(totals.points, 4);
    assert.strictEqual(totals.sumLng, 10 + 15 + 700 + 703);
    assert.strictEqual(totals.sumLat, 20 + 21 + 800 + 802);
});

test('несколько колец внутри одного полигона — это дырки, они тоже считаются', function () {
    const totals = verify.unpackOutline([[2, 2]], packed([1, 1, 5, 1]), packed([0, 0, 0, 0]));
    assert.strictEqual(totals.points, 4);
    assert.strictEqual(totals.sumLng, 1 + 2 + 5 + 6);
});

test('строка страны разбирается вместе с упакованным контуром', function () {
    const line = "('QA','{\"ru\":\"Катар\",\"en\":\"Qatar, State of\"}'::jsonb," +
        '25.331,51.212,0.42,0.0065,' +
        "public.nf_unpack_outline('[[3]]'::jsonb,'" + packed([100, 50, -20]) +
        "','" + packed([200, -10, 5]) + "')),";
    const rows = verify.parseRows(line);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].code, 'QA');
    assert.strictEqual(rows[0].lat, 25331);
    assert.strictEqual(rows[0].lng, 51212);
    assert.strictEqual(rows[0].spread, 420);
    assert.strictEqual(rows[0].outline.points, 3);
});

test('запятая внутри имени страны не обрывает разбор', function () {
    // Имя забирается жадно именно ради этого: «Qatar, State of» содержит
    // запятую, и нежадный разбор оборвал бы строку на ней.
    const line = "('QA','{\"en\":\"Qatar, State of\"}'::jsonb,1,2,0.4,0," +
        "public.nf_unpack_outline('[[1]]'::jsonb,'" + packed([0]) + "','" + packed([0]) + "'))";
    assert.strictEqual(verify.parseRows(line).length, 1);
});

test('заголовок и хвост оператора строками данных не считаются', function () {
    const text = [
        'insert into public.countries (code, names, lat, lng, spread, land_share, outline) values',
        'on conflict (code) do update set names = excluded.names;'
    ].join('\n');
    assert.deepStrictEqual(verify.parseRows(text), []);
});

test('запрос ограничен списком кодов: лишние строки базы не считаются расхождением', function () {
    const sql = verify.buildSql(['AD', 'QA']);
    assert.match(sql, /code = any\(array\['AD','QA'\]\)/);
    assert.match(sql, /jsonb_array_elements/);
});

test('ключи командной строки', function () {
    assert.strictEqual(verify.parseArgs(['--sql=/tmp']).problem, null);
    assert.match(verify.parseArgs([]).problem, /не указан --sql/);
    assert.match(verify.parseArgs(['--sql=/tmp', '--chunks']).problem, /непонятный ключ/);
});
