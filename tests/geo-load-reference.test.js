/**
 * Проверка загрузчика справочника: разбор порций, порядок, ключи запуска.
 *
 * Что здесь НЕ проверяется и почему. Подключение к базе — не проверяется:
 * для этого нужна живая база, а из рабочей среды агента сеть до Supabase
 * закрыта. Поэтому загрузчик устроен так, чтобы всё, что можно сломать
 * молча, лежало в чистых функциях: разбор файла, порядок порций, разбор
 * ключей командной строки. Ошибка в них — это либо «порция считается
 * применённой, хотя её нет», либо «города пошли раньше стран», и то и другое
 * тест ловит без сети.
 *
 * Оси проверки:
 *   - вид порции по имени файла, включая вспомогательные файлы;
 *   - ключи из файла: сколько, какие, и одинаково ли при повторном разборе
 *     (регулярное выражение с флагом g помнит позицию между вызовами —
 *     это и есть самая тихая ошибка в таком разборе);
 *   - порядок: страны раньше городов независимо от порядка на входе;
 *   - отбор половины справочника;
 *   - ключи командной строки и их границы.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');

const loader = require('../tools/geo/load-reference.js');

const COUNTRIES_SQL = [
    'insert into public.countries (code, names, lat, lng, spread, land_share, outline) values',
    "('AD','{\"ru\":\"Андорра\"}'::jsonb,42.5,1.6,0.4,0.0001,'[]'::jsonb),",
    "('AE','{\"ru\":\"ОАЭ\"}'::jsonb,24.0,54.0,2.2,0.0004,'[]'::jsonb)",
    'on conflict (code) do update set names = excluded.names;'
].join('\n');

const NAMES_SQL = [
    'update public.geo_cities as g',
    'set names = v.names::jsonb,',
    "    names_source = 'natural-earth'",
    'from (values',
    '    (292223, \'{"ru":"Дубай","en":"Dubai"}\'),',
    '    (292672, \'{"ru":"Шарджа","en":"Sharjah"}\')',
    ') as v(geoname_id, names)',
    'where g.geoname_id = v.geoname_id',
    '  and g.names is null;'
].join('\n');

const CITIES_SQL = [
    'insert into public.geo_cities (geoname_id, name, country_code, lat, lng, population) values',
    "(10570,'Alvand','IR',36.1893,50.0643,90000),",
    "(14256,'Azadshahr','IR',34.79049,48.57011,514102),",
    "(23814,'Kahriz','IR',34.3838,47.0553,766706)",
    'on conflict (geoname_id) do nothing;'
].join('\n');

test('вид порции определяется по имени файла', function () {
    assert.strictEqual(loader.kindOf('countries-01.sql'), 'countries');
    assert.strictEqual(loader.kindOf('geo-cities-17.sql'), 'cities');
    assert.strictEqual(loader.kindOf('city-names-13.sql'), 'names');
    assert.strictEqual(loader.kindOf('helper-create.sql'), null);
    assert.strictEqual(loader.kindOf('helper-drop.sql'), null);
    assert.strictEqual(loader.kindOf('seed-guangzhou.sql'), null);
});

test('из порции стран вынимаются коды, из порции городов — числа', function () {
    const countries = loader.parseChunk('countries-01.sql', COUNTRIES_SQL);
    assert.strictEqual(countries.kind, 'countries');
    assert.strictEqual(countries.rows, 2);
    assert.deepStrictEqual(countries.keys, ['AD', 'AE']);

    const cities = loader.parseChunk('geo-cities-01.sql', CITIES_SQL);
    assert.strictEqual(cities.kind, 'cities');
    assert.strictEqual(cities.rows, 3);
    assert.deepStrictEqual(cities.keys, [10570, 14256, 23814]);
    cities.keys.forEach(function (key) {
        assert.strictEqual(typeof key, 'number');
    });
});

test('порция написаний разбирается, хотя это update, а строки с отступом', function () {
    const names = loader.parseChunk('city-names-01.sql', NAMES_SQL);
    assert.strictEqual(names.kind, 'names');
    assert.strictEqual(names.rows, 2);
    assert.deepStrictEqual(names.keys, [292223, 292672]);
});

test('вид порции задаёт и ожидаемый оператор: у написаний нет insert', function () {
    // Пока ожидаемый оператор был зашит как insert, порция написаний
    // объявлялась битой — а она законная, просто update.
    assert.doesNotThrow(function () { loader.parseChunk('city-names-01.sql', NAMES_SQL); });
    assert.throws(function () {
        loader.parseChunk('city-names-01.sql', CITIES_SQL);
    }, /нет оператора update/);
});

test('повторный разбор того же файла даёт тот же результат', function () {
    // Общий RegExp с флагом g помнит lastIndex: второй разбор начался бы
    // с середины файла, порция недосчиталась бы ключей — и была бы залита
    // второй раз при каждом возобновлении.
    const first = loader.parseChunk('geo-cities-01.sql', CITIES_SQL);
    const second = loader.parseChunk('geo-cities-01.sql', CITIES_SQL);
    assert.deepStrictEqual(second.keys, first.keys);
});

test('строка данных узнаётся только с начала строки', function () {
    // Координаты внутри строки выглядят как «(34.79049,», и если разбор
    // пойдёт по всему тексту, ключей окажется втрое больше, чем строк.
    const cities = loader.parseChunk('geo-cities-01.sql', CITIES_SQL);
    assert.strictEqual(cities.rows, CITIES_SQL.split('\n').length - 2);
});

test('файл без нужного оператора и файл без строк — это ошибка, а не пустая порция', function () {
    assert.throws(function () {
        loader.parseChunk('countries-01.sql', '-- только комментарий\n');
    }, /нет оператора insert/);
    assert.throws(function () {
        loader.parseChunk('countries-01.sql', 'insert into public.countries values\n;');
    }, /ни одной строки данных/);
});

test('повтор ключа внутри порции — ошибка, а не мелочь', function () {
    // База вернёт число РАЗЛИЧНЫХ ключей, и оно никогда не сравняется
    // с числом строк: порция навсегда останется «неприменённой» и будет
    // заливаться при каждом запуске. Данным не вредит, поэтому молча.
    const doubled = CITIES_SQL.replace(
        "(14256,'Azadshahr','IR',34.79049,48.57011,514102),",
        "(14256,'Azadshahr','IR',34.79049,48.57011,514102),\n(14256,'Azadshahr','IR',34.79049,48.57011,514102),"
    );
    assert.throws(function () {
        loader.parseChunk('geo-cities-01.sql', doubled);
    }, /ключ встречается дважды/);
});

test('ключ --force распознаётся: им чинят уже залитую, но неверную строку', function () {
    const plain = loader.parseArgs(['--sql=/tmp']);
    assert.strictEqual(plain.force, false);
    const forced = loader.parseArgs(['--sql=/tmp', '--force']);
    assert.strictEqual(forced.problem, null);
    assert.strictEqual(forced.force, true);
});

test('страны идут раньше городов независимо от порядка на входе', function () {
    const mixed = [
        { file: 'city-names-01.sql', kind: 'names' },
        { file: 'geo-cities-02.sql', kind: 'cities' },
        { file: 'countries-02.sql', kind: 'countries' },
        { file: 'geo-cities-01.sql', kind: 'cities' },
        { file: 'countries-01.sql', kind: 'countries' }
    ];
    const ordered = loader.orderChunks(mixed).map(function (chunk) { return chunk.file; });
    // Города не лягут без стран (внешний ключ), написания не лягут без городов
    // (это update). Порядок здесь — не косметика.
    assert.deepStrictEqual(ordered, [
        'countries-01.sql', 'countries-02.sql',
        'geo-cities-01.sql', 'geo-cities-02.sql',
        'city-names-01.sql'
    ]);
});

test('--only оставляет одну половину справочника', function () {
    const mixed = [
        { file: 'geo-cities-01.sql', kind: 'cities' },
        { file: 'countries-01.sql', kind: 'countries' }
    ];
    assert.deepStrictEqual(
        loader.orderChunks(mixed, 'cities').map(function (c) { return c.file; }),
        ['geo-cities-01.sql']
    );
    assert.deepStrictEqual(
        loader.orderChunks(mixed, 'countries').map(function (c) { return c.file; }),
        ['countries-01.sql']
    );
});

test('ключи командной строки: значения по умолчанию и границы', function () {
    const plain = loader.parseArgs(['--sql=/tmp/sql']);
    assert.strictEqual(plain.problem, null);
    assert.strictEqual(plain.sqlDir, '/tmp/sql');
    assert.strictEqual(plain.only, null);
    assert.strictEqual(plain.dryRun, false);
    assert.ok(plain.pause > 0);

    assert.match(loader.parseArgs([]).problem, /не указан --sql/);
    assert.match(loader.parseArgs(['--sql=/tmp', '--only=towns']).problem, /countries, cities, names/);
    assert.strictEqual(loader.parseArgs(['--sql=/tmp', '--only=names']).problem, null);
    assert.match(loader.parseArgs(['--sql=/tmp', '--pause=-1']).problem, /--pause/);
    assert.match(loader.parseArgs(['--sql=/tmp', '--pause=999999']).problem, /--pause/);
    assert.match(loader.parseArgs(['--sql=/tmp', '--pause=нет']).problem, /--pause/);
    assert.match(loader.parseArgs(['--sql=/tmp', '--yolo']).problem, /непонятный ключ/);
});

test('--pause=0 разрешён: это «без пауз», а не отсутствие значения', function () {
    const options = loader.parseArgs(['--sql=/tmp', '--pause=0']);
    assert.strictEqual(options.problem, null);
    assert.strictEqual(options.pause, 0);
});
