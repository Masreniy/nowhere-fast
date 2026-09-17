/**
 * Проверка сверки справочника городов.
 *
 * Зачем этот тест. Сверка — это сторож, и сломанный сторож хуже отсутствующего:
 * он говорит «всё сошлось» и закрывает вопрос. Поэтому здесь проверяется не то,
 * что сверка что-то считает, а то, что она **ловит порчу**: испорченная цифра
 * в координате, подменённое имя, потерянная строка — каждая из них обязана
 * изменить итог. Именно такую ошибку (одну цифру в контуре Мексики) сверка
 * поймала при заливке стран.
 *
 * Оси проверки:
 *   - сдвиг десятичной строки: знак, нехватка и избыток знаков после точки;
 *   - разбор строк: заголовок и хвост оператора не считаются данными,
 *     удвоенный апостроф в имени превращается в один;
 *   - итог не зависит от порядка строк (в базе порядок свой);
 *   - любая порча данных меняет итог;
 *   - сравнение терпит разные типы: база отдаёт bigint строкой.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const verify = require('../tools/geo/verify-cities.js');

const SQL = [
    'insert into public.geo_cities (geoname_id, name, country_code, lat, lng, population) values',
    "(10570,'Alvand','IR',36.1893,50.0643,90000),",
    "(71334,'Sa''dah','YE',16.94021,43.76393,51870),",
    "(225284,'''Ali Sabieh','DJ',11.15583,42.7125,55000),",
    "(3448439,'Sao Paulo','BR',-23.5475,-46.63611,10021295)",
    'on conflict (geoname_id) do nothing;'
].join('\n');

test('десятичная строка сдвигается без плавающей точки', function () {
    assert.strictEqual(verify.scaleDecimal('36.1893', 5), 3618930);
    assert.strictEqual(verify.scaleDecimal('-23.5475', 5), -2354750);
    assert.strictEqual(verify.scaleDecimal('42.7125', 5), 4271250);
    assert.strictEqual(verify.scaleDecimal('7', 5), 700000);
    assert.strictEqual(verify.scaleDecimal('-0.5', 5), -50000);
    // Лишние знаки отрезаются, а не округляются: в источнике их не бывает,
    // но молча превратить 1.234567 в 1.23457 хуже, чем отрезать предсказуемо.
    assert.strictEqual(verify.scaleDecimal('1.234567', 5), 123456);
});

test('считаются только строки данных, апостроф в имени разэкранируется', function () {
    const rows = verify.parseRows(SQL);
    assert.strictEqual(rows.length, 4);
    assert.deepStrictEqual(rows.map(function (r) { return r.name; }),
        ['Alvand', "Sa'dah", "'Ali Sabieh", 'Sao Paulo']);
    assert.strictEqual(rows[0].lat, 3618930);
    assert.strictEqual(rows[3].lng, -4663611);
});

test('итог не зависит от порядка строк', function () {
    const rows = verify.parseRows(SQL);
    const shuffled = [rows[2], rows[0], rows[3], rows[1]];
    assert.deepStrictEqual(verify.checksum(shuffled), verify.checksum(rows));
});

test('порча одной цифры в координате меняет итог', function () {
    const clean = verify.checksum(verify.parseRows(SQL));
    const broken = verify.checksum(verify.parseRows(SQL.replace('50.0643', '50.0644')));
    assert.notStrictEqual(broken.sum_lng, clean.sum_lng);
    assert.strictEqual(broken.rows, clean.rows);
});

test('подменённое имя меняет хэш, но не суммы', function () {
    const clean = verify.checksum(verify.parseRows(SQL));
    const broken = verify.checksum(verify.parseRows(SQL.replace("'Alvand'", "'Alvend'")));
    assert.notStrictEqual(broken.names_md5, clean.names_md5);
    assert.strictEqual(broken.sum_id, clean.sum_id);
});

test('потерянная строка меняет и число строк, и суммы', function () {
    const clean = verify.checksum(verify.parseRows(SQL));
    const shorter = verify.checksum(verify.parseRows(
        SQL.replace("(71334,'Sa''dah','YE',16.94021,43.76393,51870),\n", '')
    ));
    assert.strictEqual(shorter.rows, clean.rows - 1);
    assert.notStrictEqual(shorter.sum_id, clean.sum_id);
});

test('сравнение не спотыкается о тип: база отдаёт bigint строкой', function () {
    const expected = verify.checksum(verify.parseRows(SQL));
    const fromDatabase = {
        rows: String(expected.rows),
        sum_id: String(expected.sum_id),
        sum_population: String(expected.sum_population),
        sum_lat: String(expected.sum_lat),
        sum_lng: String(expected.sum_lng),
        names_md5: expected.names_md5
    };
    assert.deepStrictEqual(verify.compare(expected, fromDatabase), []);
});

test('расхождение называется поимённо', function () {
    const expected = verify.checksum(verify.parseRows(SQL));
    const broken = Object.assign({}, expected, { sum_lat: expected.sum_lat + 1 });
    const problems = verify.compare(expected, broken);
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /^sum_lat: в источнике/);
});

test('ключи командной строки', function () {
    assert.strictEqual(verify.parseArgs(['--sql=/tmp']).problem, null);
    assert.match(verify.parseArgs([]).problem, /не указан --sql/);
    assert.match(verify.parseArgs(['--sql=/tmp', '--whatever']).problem, /непонятный ключ/);
    assert.strictEqual(verify.parseArgs(['--sql=/tmp', '--chunks']).chunks, true);
});
