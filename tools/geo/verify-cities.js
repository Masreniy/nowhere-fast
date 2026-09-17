/**
 * Сверяет справочник городов в базе с исходным SQL — до последней цифры.
 *
 * ЗАЧЕМ. Справочник попадает в базу двумя путями: `load-reference.js`
 * отправляет файл как есть, а агент в сессии пересказывает содержимое файла
 * в параметр инструмента. Второй путь — ручная транскрипция мегабайта цифр,
 * и она уже один раз соврала: при заливке стран у Мексики в контуре появилось
 * `[-97.17,15.91]` вместо `[-97.18,15.91]`. Поймала это не проверка глазами,
 * а сверка хэшей.
 *
 * У городов та же ошибка выглядит хуже: город молча встанет не на своё место
 * на глобусе, и заметить это можно только случайно, открыв нужную страну.
 * Поэтому сверка не «желательна после заливки», а обязательна.
 *
 * ЧТО СЧИТАЕТСЯ. Пять чисел и один хэш по всему справочнику:
 *
 *   строк, сумма geoname_id, сумма населения,
 *   сумма широт и долгот, умноженных на 100000 (целые — без плавающей точки),
 *   md5 от «имя|код страны» всех городов по возрастанию geoname_id.
 *
 * Почему именно так. Суммы ловят порчу любой цифры в числовых полях, хэш —
 * в текстовых. Одной суммы мало: две ошибки могут погасить друг друга, но
 * не в пяти величинах сразу. А считать построчный хэш по девяти тысячам строк
 * в браузере или в отчёте незачем — если сверка разошлась, виноватую порцию
 * ищут ключом `--chunks`.
 *
 * ПОЧЕМУ НЕ ЧЕРЕЗ float. Широта в файле записана десятичной строкой, в базе —
 * double precision. Умножать double на 100000 в JavaScript и в Postgres —
 * значит сравнивать два разных округления. Поэтому и здесь, и в SQL число
 * сдвигается как десятичная строка (`lat::numeric * 100000`), а не как
 * плавающее.
 *
 * Запуск:
 *
 *   node tools/geo/verify-cities.js --sql=<каталог с SQL>
 *   node tools/geo/verify-cities.js --sql=<каталог> --compare='<json из базы>'
 *   node tools/geo/verify-cities.js --sql=<каталог> --names [--compare=…]
 *
 * Без `--compare` печатает ожидаемые величины и готовый запрос: его выполняют
 * в редакторе SQL Supabase или через MCP-коннектор, а ответ возвращают сюда
 * ключом `--compare`. Ключ `--chunks` печатает то же по каждому файлу — им
 * ищут, какая именно порция разошлась.
 *
 * КЛЮЧ `--names` сверяет не сам справочник, а написания на десяти языках
 * (`city-names-*.sql` против колонки `names`). Это самый опасный груз из
 * всех: девятьсот килобайт текста русским, китайским, арабским, хинди
 * и японским письмом. Суммы тут не помогают — текст не складывается, —
 * поэтому считается хэш по всем языкам в порядке `NF.i18n.LANGS`.
 * Отсутствующий язык участвует пустой строкой, а не пропускается: иначе
 * потерянный `ar` и пустой `ar` дали бы один хэш.
 *
 * Не всякое написание доедет до базы, и это не ошибка. В `city-names-*.sql`
 * есть города, которых в справочнике нет: их страна не имеет кода ISO —
 * Косово (Приштина, Призрен) и заморские департаменты Франции (Кайенна,
 * Фор-де-Франс, Сен-Дени). Решение владельца от 16.09.2026 — оставить как
 * есть (конец ADR-0010). Поэтому, если рядом лежат и файлы городов, сверка
 * считает хэш только по тем написаниям, которым есть куда лечь, и говорит,
 * сколько отбросила. Без файлов городов отличить «не доехало» от «некуда
 * было ложиться» нельзя, и она об этом предупреждает, а не молчит.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const shared = require('./checksum.js');

/** Во сколько раз сдвигаются координаты. В источнике не больше пяти знаков. */
const COORD_SCALE_DIGITS = 5;

/**
 * Строка данных: `(10570,'Alvand','IR',36.1893,50.0643,90000),`
 *
 * Имя забирается жадно: внутри него апостроф удвоен (`'Sa''dah'`), и нежадный
 * разбор оборвал бы имя на первом же удвоении.
 */
const ROW = /^\((\d+),'(.*)','([A-Z]{2})',(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+)\),?$/;

/** Языки интерфейса в порядке NF.i18n.LANGS: порядок входит в хэш. */
const LANGS = ['ru', 'en', 'zh', 'es', 'ar', 'hi', 'pt', 'fr', 'de', 'ja'];

/** Строка написаний: `    (292223, '{"ru":"Дубай",…}'),` */
const NAME_ROW = /^\((\d+), '(.*)'\),?$/;

const NAMES_SQL = 'select count(*)::bigint as rows,' +
    ' sum(geoname_id)::bigint as sum_id,' +
    " md5(string_agg(geoname_id || '|' || concat_ws('|', " +
    LANGS.map(function (lang) { return "coalesce(names->>'" + lang + "', '')"; }).join(', ') +
    '), chr(10) order by geoname_id)) as names_md5' +
    ' from public.geo_cities where names is not null;';

const CHECK_SQL = 'select count(*)::bigint as rows,' +
    ' sum(geoname_id)::bigint as sum_id,' +
    ' sum(population)::bigint as sum_population,' +
    ' sum(round(lat::numeric * 100000))::bigint as sum_lat,' +
    ' sum(round(lng::numeric * 100000))::bigint as sum_lng,' +
    " md5(string_agg(name || '|' || country_code, chr(10) order by geoname_id)) as names_md5" +
    ' from public.geo_cities;';

/** Разбирает строки данных одного файла. Заголовок и хвост оператора пропускаются. */
function parseRows(text) {
    const rows = [];
    text.split('\n').forEach(function (line) {
        const match = ROW.exec(line.trim());
        if (!match) {
            return;
        }
        rows.push({
            id: Number(match[1]),
            name: match[2].split("''").join("'"),
            country: match[3],
            lat: shared.scaleDecimal(match[4], COORD_SCALE_DIGITS),
            lng: shared.scaleDecimal(match[5], COORD_SCALE_DIGITS),
            population: Number(match[6])
        });
    });
    return rows;
}

/** Пять сумм и хэш имён. Порядок для хэша — по geoname_id, как в SQL. */
function checksum(rows) {
    const sorted = rows.slice().sort(function (a, b) { return a.id - b.id; });
    const totals = { rows: sorted.length, sum_id: 0, sum_population: 0, sum_lat: 0, sum_lng: 0 };
    const lines = [];
    sorted.forEach(function (row) {
        totals.sum_id += row.id;
        totals.sum_population += row.population;
        totals.sum_lat += row.lat;
        totals.sum_lng += row.lng;
        lines.push(row.name + '|' + row.country);
    });
    totals.names_md5 = shared.md5(lines.join('\n'));
    return totals;
}

/** Разбирает строки написаний одного файла. */
function parseNameRows(text) {
    const rows = [];
    text.split('\n').forEach(function (line) {
        const match = NAME_ROW.exec(line.trim());
        if (!match) {
            return;
        }
        rows.push({
            id: Number(match[1]),
            names: JSON.parse(match[2].split("''").join("'"))
        });
    });
    return rows;
}

/** Хэш написаний. Считается ровно так же, как запрос NAMES_SQL. */
function namesChecksum(rows) {
    const sorted = rows.slice().sort(function (a, b) { return a.id - b.id; });
    const lines = sorted.map(function (row) {
        const values = LANGS.map(function (lang) { return row.names[lang] || ''; });
        return row.id + '|' + values.join('|');
    });
    let sumId = 0;
    sorted.forEach(function (row) { sumId += row.id; });
    return { rows: sorted.length, sum_id: sumId, names_md5: shared.md5(lines.join('\n')) };
}

/** Читает все порции написаний из каталога. */
function readNameFiles(dir) {
    const rows = [];
    fs.readdirSync(dir).filter(function (name) {
        return name.indexOf('city-names-') === 0 && name.slice(-4) === '.sql';
    }).sort().forEach(function (name) {
        Array.prototype.push.apply(rows, parseNameRows(fs.readFileSync(path.join(dir, name), 'utf8')));
    });
    return rows;
}

/** Читает все порции городов из каталога. */
function readCityFiles(dir) {
    return fs.readdirSync(dir).filter(function (name) {
        return name.indexOf('geo-cities-') === 0 && name.slice(-4) === '.sql';
    }).sort().map(function (name) {
        return { file: name, rows: parseRows(fs.readFileSync(path.join(dir, name), 'utf8')) };
    });
}

function parseArgs(argv) {
    const options = { sqlDir: null, compare: null, chunks: false, names: false, problem: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.indexOf('--sql=') === 0) {
            options.sqlDir = arg.slice('--sql='.length);
        } else if (arg.indexOf('--compare=') === 0) {
            options.compare = arg.slice('--compare='.length);
        } else if (arg === '--chunks') {
            options.chunks = true;
        } else if (arg === '--names') {
            options.names = true;
        } else {
            options.problem = 'непонятный ключ: ' + arg;
            return options;
        }
    }
    if (!options.sqlDir) {
        options.problem = 'не указан --sql=<каталог с SQL>';
    }
    return options;
}

/**
 * Отбрасывает написания, которым некуда лечь: города с таким geoname_id
 * в справочнике нет. Возвращает оставшиеся и число отброшенных.
 */
function matchedNames(rows, cityFiles) {
    if (cityFiles.length === 0) {
        return { rows: rows, dropped: null };
    }
    const known = new Set();
    cityFiles.forEach(function (entry) {
        entry.rows.forEach(function (row) { known.add(row.id); });
    });
    const kept = rows.filter(function (row) { return known.has(row.id); });
    return { rows: kept, dropped: rows.length - kept.length };
}

/** Отдельный проход: написания, а не сам справочник. */
function verifyNames(options) {
    const all = readNameFiles(options.sqlDir);
    if (all.length === 0) {
        process.stderr.write('в каталоге ' + options.sqlDir + ' нет файлов city-names-*.sql\n');
        return 2;
    }
    const matched = matchedNames(all, readCityFiles(options.sqlDir));
    if (matched.dropped === null) {
        process.stdout.write('рядом нет файлов geo-cities-*.sql: написания городов, ' +
            'которых нет в справочнике, отличить не получится\n\n');
    } else if (matched.dropped > 0) {
        process.stdout.write('отброшено написаний без города в справочнике: ' +
            matched.dropped + ' (Косово и заморские департаменты Франции, ADR-0010)\n\n');
    }
    const rows = matched.rows;
    const expected = namesChecksum(rows);
    shared.printTotals('ожидается в колонке names:', expected);
    if (!options.compare) {
        process.stdout.write('\nзапрос для сверки:\n' + NAMES_SQL + '\n');
        return 0;
    }
    return shared.reportComparison(expected, options.compare);
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.problem) {
        process.stderr.write(options.problem + '\n');
        return 2;
    }
    if (options.names) {
        return verifyNames(options);
    }
    const files = readCityFiles(options.sqlDir);
    if (files.length === 0) {
        process.stderr.write('в каталоге ' + options.sqlDir + ' нет файлов geo-cities-*.sql\n');
        return 2;
    }
    if (options.chunks) {
        files.forEach(function (entry) {
            shared.printTotals(entry.file, checksum(entry.rows));
        });
        return 0;
    }
    const all = [];
    files.forEach(function (entry) { Array.prototype.push.apply(all, entry.rows); });
    const expected = checksum(all);
    shared.printTotals('ожидается в базе (' + files.length + ' порций):', expected);
    if (!options.compare) {
        process.stdout.write('\nзапрос для сверки:\n' + CHECK_SQL + '\n');
        return 0;
    }
    const code = shared.reportComparison(expected, options.compare);
    if (code !== 0) {
        process.stdout.write('ищи виноватую порцию ключом --chunks\n');
    }
    return code;
}

module.exports = {
    parseRows: parseRows,
    matchedNames: matchedNames,
    checksum: checksum,
    parseNameRows: parseNameRows,
    namesChecksum: namesChecksum,
    parseArgs: parseArgs,
    LANGS: LANGS,
    CHECK_SQL: CHECK_SQL,
    NAMES_SQL: NAMES_SQL
};

if (require.main === module) {
    process.exitCode = main();
}
