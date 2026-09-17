/**
 * Сверяет страны в базе с исходным SQL — включая очертания.
 *
 * ЗАЧЕМ ИМЕННО ЭТА СВЕРКА. Реальная порча данных случилась не в городах,
 * а здесь: при ручной заливке у Мексики в контуре появилось `[-97.17,15.91]`
 * вместо `[-97.18,15.91]`. Одна цифра в одной из тридцати двух тысяч точек.
 * Пока сверки не было, такое находилось бы случайно — кто-то однажды заметил
 * бы, что берег в этом месте дёрнулся на километр.
 *
 * ПОЧЕМУ ЭТО СЛОЖНЕЕ, ЧЕМ У ГОРОДОВ. У города шесть простых полей. У страны
 * основной вес — в очертаниях, и в исходном SQL они лежат **упакованными**:
 * функция `public.nf_unpack_outline` разворачивает два массива int16-дельт
 * из base64 в четырёхуровневый JSON. Чтобы сверить, надо распаковать их
 * здесь так же, как это делает SQL, — что и делает `unpackOutline` ниже.
 * Алгоритм повторён с `helper-create.sql` дословно, вплоть до того, как
 * долгота заворачивается через антимеридиан.
 *
 * ЧТО СЧИТАЕТСЯ. Сумма — а не построчный хэш — потому что порядок точек
 * в базе и в файле один, но полагаться на совпадение форматирования jsonb
 * нельзя: Postgres печатает числа по-своему. Сумма от форматирования
 * не зависит вовсе.
 *
 *   стран, хэш кодов, суммы широт, долгот и угловых размахов,
 *   число точек в очертаниях, суммы долгот и широт всех этих точек.
 *
 * Доля суши (`land_share`) в сверку не входит намеренно: генератор округлял
 * её по-разному в разных проходах, и сверять её значило бы ловить не порчу
 * данных, а историю их появления.
 *
 * СТРАНЫ, КОТОРЫХ НЕТ В ИСТОЧНИКЕ, сверка не трогает: запрос ограничен
 * списком кодов из файлов. Их число печатается отдельно — если в базе
 * оказалось больше строк, это видно, но это не расхождение.
 *
 * Запуск:
 *
 *   node tools/geo/verify-countries.js --sql=<каталог с SQL>
 *   node tools/geo/verify-countries.js --sql=<каталог> --compare='<json из базы>'
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const shared = require('./checksum.js');

/** Координаты упакованы в сотых долях градуса. */
const COORD_SCALE_DIGITS = 2;

/** Долгота в сотых долях: полный круг — 36000, полукруг — 18000. */
const WRAP = 36000;
const HALF_WRAP = 18000;

/** Широта, долгота и размах страны — три знака после точки, как в источнике. */
const FIELD_SCALE_DIGITS = 3;

/**
 * Строка страны:
 *   ('QA','{…}'::jsonb,25.331,51.212,0.42,0.0065,public.nf_unpack_outline('[[27]]'::jsonb,'…','…'))
 *
 * Имена забираются жадно: внутри jsonb есть и запятые, и апострофы,
 * и остановиться надо на последнем `'::jsonb,`, а не на первом удобном.
 */
const ROW = new RegExp(
    "^\\('([A-Z]{2})','.*'::jsonb," +
    '(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(\\d+(?:\\.\\d+)?),' +
    '[^,]+,' +
    "public\\.nf_unpack_outline\\('(.*)'::jsonb,'([^']*)','([^']*)'\\)\\),?$"
);

const CHECK_SQL_HEAD = 'select count(*)::bigint as countries,' +
    " md5(string_agg(code, '' order by code)) as codes_md5," +
    ' sum(round(lat::numeric * 1000))::bigint as sum_lat,' +
    ' sum(round(lng::numeric * 1000))::bigint as sum_lng,' +
    ' sum(round(spread::numeric * 1000))::bigint as sum_spread' +
    ' from public.countries where code = any($CODES$)';

const POINTS_SQL = 'select count(*)::bigint as points,' +
    " sum(round((pt->>0)::numeric * 100))::bigint as sum_outline_lng," +
    " sum(round((pt->>1)::numeric * 100))::bigint as sum_outline_lat" +
    ' from public.countries c,' +
    ' lateral jsonb_array_elements(c.outline) poly,' +
    ' lateral jsonb_array_elements(poly) ring,' +
    ' lateral jsonb_array_elements(ring) pt' +
    ' where c.code = any($CODES$)';

/**
 * Разворачивает упакованные очертания — построчный перевод `nf_unpack_outline`.
 *
 * Возвращает не сами точки, а сразу их число и суммы: точек тридцать тысяч,
 * держать их в памяти незачем, а сверяется всё равно сумма.
 */
function unpackOutline(polys, lonBase64, latBase64) {
    const lonBytes = Buffer.from(lonBase64, 'base64');
    const latBytes = Buffer.from(latBase64, 'base64');
    const totals = { points: 0, sumLng: 0, sumLat: 0 };
    let index = 0;
    polys.forEach(function (rings) {
        rings.forEach(function (ringLength) {
            let lon = 0;
            let lat = 0;
            for (let k = 0; k < ringLength; k++) {
                lon = (((lon + lonBytes.readInt16LE(index * 2)) % WRAP) + WRAP + HALF_WRAP) % WRAP - HALF_WRAP;
                lat += latBytes.readInt16LE(index * 2);
                index += 1;
                totals.points += 1;
                totals.sumLng += lon;
                totals.sumLat += lat;
            }
        });
    });
    return totals;
}

/** Разбирает строки стран одного файла. */
function parseRows(text) {
    const rows = [];
    text.split('\n').forEach(function (line) {
        const match = ROW.exec(line.trim());
        if (!match) {
            return;
        }
        rows.push({
            code: match[1],
            lat: shared.scaleDecimal(match[2], FIELD_SCALE_DIGITS),
            lng: shared.scaleDecimal(match[3], FIELD_SCALE_DIGITS),
            spread: shared.scaleDecimal(match[4], FIELD_SCALE_DIGITS),
            outline: unpackOutline(JSON.parse(match[5]), match[6], match[7])
        });
    });
    return rows;
}

function checksum(rows) {
    const sorted = rows.slice().sort(function (a, b) { return a.code.localeCompare(b.code); });
    const totals = {
        countries: sorted.length,
        codes_md5: shared.md5(sorted.map(function (row) { return row.code; }).join('')),
        sum_lat: 0, sum_lng: 0, sum_spread: 0,
        points: 0, sum_outline_lng: 0, sum_outline_lat: 0
    };
    sorted.forEach(function (row) {
        totals.sum_lat += row.lat;
        totals.sum_lng += row.lng;
        totals.sum_spread += row.spread;
        totals.points += row.outline.points;
        totals.sum_outline_lng += row.outline.sumLng;
        totals.sum_outline_lat += row.outline.sumLat;
    });
    return totals;
}

function readCountryFiles(dir) {
    const rows = [];
    fs.readdirSync(dir).filter(function (name) {
        return name.indexOf('countries-') === 0 && name.slice(-4) === '.sql';
    }).sort().forEach(function (name) {
        Array.prototype.push.apply(rows, parseRows(fs.readFileSync(path.join(dir, name), 'utf8')));
    });
    return rows;
}

/** Подставляет список кодов в запрос: сверяем ровно то, что есть в источнике. */
function buildSql(codes) {
    const list = "array['" + codes.join("','") + "']";
    return CHECK_SQL_HEAD.replace('$CODES$', list) + ';\n\n' +
        POINTS_SQL.replace('$CODES$', list) + ';';
}

function parseArgs(argv) {
    const options = { sqlDir: null, compare: null, problem: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.indexOf('--sql=') === 0) {
            options.sqlDir = arg.slice('--sql='.length);
        } else if (arg.indexOf('--compare=') === 0) {
            options.compare = arg.slice('--compare='.length);
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

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.problem) {
        process.stderr.write(options.problem + '\n');
        return 2;
    }
    const rows = readCountryFiles(options.sqlDir);
    if (rows.length === 0) {
        process.stderr.write('в каталоге ' + options.sqlDir + ' нет строк стран\n');
        return 2;
    }
    const expected = checksum(rows);
    shared.printTotals('ожидается в базе:', expected);
    if (!options.compare) {
        const codes = rows.map(function (row) { return row.code; }).sort();
        process.stdout.write('\nдва запроса для сверки (ответы слить в один объект):\n' +
            buildSql(codes) + '\n');
        return 0;
    }
    return shared.reportComparison(expected, options.compare);
}

module.exports = {
    unpackOutline: unpackOutline,
    parseRows: parseRows,
    checksum: checksum,
    buildSql: buildSql,
    parseArgs: parseArgs
};

if (require.main === module) {
    process.exitCode = main();
}
