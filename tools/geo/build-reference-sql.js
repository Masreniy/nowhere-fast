/**
 * Готовит SQL для справочника стран и городов (`countries`, `geo_cities`).
 *
 * Зачем отдельный генератор: справочник — 235 стран и 9045 городов, это около
 * мегабайта SQL. Такой файл в репозитории бесполезен (его никто не прочитает)
 * и опасен (его правят руками, и он расходится с источником). Поэтому в репозитории
 * лежит генератор и описание загрузки (`supabase/seed-geo.sql`), а сам SQL
 * собирается заново из источников, когда он нужен.
 *
 * ИСТОЧНИКИ И ЛИЦЕНЗИИ — читать перед тем, как что-то отсюда публиковать:
 *
 *   контуры стран   world-atlas (Natural Earth)      public domain
 *   имена стран     i18n-iso-countries               MIT
 *   города          all-the-cities -> GeoNames       CC BY 4.0, атрибуция ОБЯЗАТЕЛЬНА
 *
 * Атрибуция GeoNames — условие использования, а не украшение: см. ADR-0006
 * и шапку `supabase/seed-geo.sql`.
 *
 * Запуск:
 *
 *   node tools/geo/build-reference-sql.js \
 *        --data=<путь>/globe/data.json \
 *        --modules=<путь>/globe/node_modules \
 *        --out=<каталог для SQL>
 *
 * `--data` — результат работы прототипа глобуса (`build-data.js`): из него берутся
 * имена стран на десяти языках, центр, угловой размах и упакованные контуры.
 * `--modules` — каталог node_modules прототипа, откуда берётся `all-the-cities`:
 * в `data.json` у городов НЕТ идентификатора GeoNames, а он нужен как ключ.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Население, с которого город попадает в справочник. Как в прототипе. */
const CITY_MIN_POP = 50000;

/** Долгота упакована в сотых долях градуса, поэтому круг — это 36000. */
const WRAP = 36000;

/**
 * Наименьший угловой размах страны в градусах.
 *
 * Размах в прототипе считается по сетке точек суши. У крошечной страны
 * (Сингапур, Люксембург, Гонконг) сетка ловит ровно одну точку, и размах
 * выходит ровно 0 — не «страна нулевого размера», а «сетка слишком редкая».
 * Ноль опасен: камера считает по нему, на сколько отлетать, и делит на него.
 * Порог 0.4° (около 44 км) взят из самого прототипа: там он уже стоит
 * в запасной ветке расчёта, просто до основной ветки не добрался.
 */
const MIN_SPREAD = 0.4;

/** Сколько строк уходит в один оператор insert. */
const DEFAULT_BATCH = 400;

/** И сколько байт, если строки оказались тяжёлыми. Переопределяется --max-bytes. */
const DEFAULT_MAX_BYTES = 28000;

/**
 * У страны контуры тяжелее города на два порядка, поэтому пачка мельче.
 * Переопределяется ключом `--country-batch`, когда приёмник ограничен по размеру
 * запроса: контур Канады один весит 43 КБ.
 */
const COUNTRY_BATCH_DIVISOR = 10;

function parseArgs(argv) {
    const args = {};
    argv.slice(2).forEach(function (raw) {
        const eq = raw.indexOf('=');
        if (raw.slice(0, 2) !== '--' || eq < 0) return;
        args[raw.slice(2, eq)] = raw.slice(eq + 1);
    });
    return args;
}

/** Долгота обратно в диапазон -180..180 (в сотых долях градуса). */
function wrapLon(value) {
    return ((value % WRAP) + WRAP + WRAP / 2) % WRAP - WRAP / 2;
}

/**
 * Base64 обратно в типизированный массив.
 *
 * Буфер копируется, а не оборачивается: Buffer в Node — это вид на общий пул
 * памяти, и `buf.buffer` почти никогда не начинается с нуля. Обёртка без копии
 * читает чужие байты и молча даёт мусор.
 */
function unpack(Type, base64) {
    const buf = Buffer.from(base64, 'base64');
    const bytes = new Uint8Array(buf.length);
    bytes.set(buf);
    return new Type(bytes.buffer);
}

/**
 * Разворачивает контуры всех стран из упакованного вида в координаты GeoJSON.
 *
 * Формат упаковки — из прототипа: приращения координат в сотых долях градуса
 * плюс три массива длин (сколько точек в кольце, колец в полигоне, полигонов
 * у страны). Порядок обхода обязан совпадать с порядком упаковки, иначе
 * контуры съедут на соседнюю страну, и это будет видно только глазами.
 *
 * @returns {Array} на каждую страну — массив полигонов, полигон — массив колец,
 *                  кольцо — массив точек [lng, lat]
 */
function unpackOutlines(geo, countryCount) {
    const lonDelta = unpack(Int16Array, geo.lon);
    const latDelta = unpack(Int16Array, geo.lat);
    const ringLens = unpack(Uint16Array, geo.ringLens);
    const polyLens = unpack(Uint16Array, geo.polyLens);
    const countryLens = unpack(Uint16Array, geo.countryLens);

    const result = [];
    let point = 0;
    let ring = 0;
    let poly = 0;

    for (let ci = 0; ci < countryCount; ci++) {
        const polys = [];
        const polyCount = countryLens[ci];
        for (let p = 0; p < polyCount; p++) {
            const ringCount = polyLens[poly++];
            const rings = [];
            for (let r = 0; r < ringCount; r++) {
                const pointCount = ringLens[ring++];
                rings.push(readRing(lonDelta, latDelta, point, pointCount));
                point += pointCount;
            }
            polys.push(rings);
        }
        result.push(polys);
    }

    if (point !== lonDelta.length) {
        throw new Error('распаковка контуров прочитала ' + point +
            ' точек из ' + lonDelta.length + ' — формат разошёлся с прототипом');
    }
    return result;
}

/** Одно кольцо: приращения складываются в абсолютные координаты. */
function readRing(lonDelta, latDelta, start, count) {
    const points = [];
    let lon = 0;
    let lat = 0;
    for (let k = 0; k < count; k++) {
        lon = wrapLon(lon + lonDelta[start + k]);
        lat += latDelta[start + k];
        points.push([lon / 100, lat / 100]);
    }
    return points;
}

/**
 * Собирает строки таблицы `countries`.
 *
 * Два решения, которые видно только на данных:
 *
 *   1. Пять записей атласа не имеют кода ISO 3166-1 (Сомалиленд, Косово,
 *      Северный Кипр, Индоокеанские территории, ледник Сиачен) — это спорные
 *      территории. Ключ таблицы — код ISO, поэтому они не загружаются.
 *      Выдумать им код нельзя: код страны — это факт, а не наша договорённость.
 *   2. Код AU встречается дважды: собственно Австралия и острова Ашмор
 *      отдельной записью. Контуры сливаются в одну строку, а центр и размах
 *      берутся у записи с территорией — иначе центр Австралии уехал бы
 *      на необитаемые острова.
 */
function buildCountries(data) {
    const outlines = unpackOutlines(data.geo, data.countries.length);
    const byCode = new Map();
    const skipped = [];
    const merged = [];

    data.countries.forEach(function (country, index) {
        if (!country.code) {
            skipped.push((country.names && country.names.en) || '(без имени)');
            return;
        }
        const existing = byCode.get(country.code);
        if (!existing) {
            byCode.set(country.code, {
                code: country.code,
                names: country.names,
                lat: country.lat,
                lng: country.lng,
                spread: country.spread,
                dots: country.dots,
                outline: outlines[index],
            });
            return;
        }

        merged.push(country.code);
        existing.outline = existing.outline.concat(outlines[index]);
        if (country.dots > existing.dots) {
            existing.names = country.names;
            existing.lat = country.lat;
            existing.lng = country.lng;
            existing.spread = country.spread;
        }
        existing.dots += country.dots;
    });

    // Страна без контура — это страна, которой нет в атласе 1:50 млн. У неё
    // и центр остался нулевым, то есть «точка в Атлантике». Единственная такая
    // запись — Ватикан. Достроить её по памяти нельзя: координаты обязаны
    // прийти из источника, а этот источник их не даёт.
    const noGeometry = [];
    const withGeometry = Array.from(byCode.values()).filter(function (c) {
        if (c.outline.length > 0) return true;
        noGeometry.push(c.code);
        return false;
    });

    const rows = withGeometry.map(function (c) {
        return {
            code: c.code,
            names: c.names,
            lat: c.lat,
            lng: c.lng,
            spread: Math.max(MIN_SPREAD, c.spread),
            // Доля суши планеты в процентах. Считается по той же сетке точек,
            // которой прототип определял, какой стране принадлежит точка.
            land_share: Number((c.dots / data.landSamples * 100).toFixed(4)),
            outline: c.outline,
        };
    });
    rows.sort(function (a, b) { return a.code < b.code ? -1 : 1; });
    return { rows: rows, skipped: skipped, merged: merged, noGeometry: noGeometry };
}

/**
 * Собирает строки таблицы `geo_cities`.
 *
 * Города берутся не из `data.json`, а прямо из `all-the-cities`: в прототипе
 * идентификатор GeoNames не сохранялся (он был там не нужен), а нам он нужен
 * как ключ — иначе повторная загрузка задваивает справочник.
 *
 * Фильтр повторяет прототип: население от 50 тысяч и страна, которая есть
 * в справочнике. Город без известной страны загрузить нельзя — внешний ключ.
 */
function buildGeoCities(allCities, knownCodes) {
    const seen = new Set();
    const rows = [];
    const dropped = { smallPopulation: 0, unknownCountry: 0, duplicateId: 0 };

    allCities.forEach(function (city) {
        if (city.population < CITY_MIN_POP) { dropped.smallPopulation++; return; }
        if (!knownCodes.has(city.country)) { dropped.unknownCountry++; return; }
        if (seen.has(city.cityId)) { dropped.duplicateId++; return; }
        seen.add(city.cityId);
        rows.push({
            geoname_id: city.cityId,
            name: city.name,
            country_code: city.country,
            lng: city.loc.coordinates[0],
            lat: city.loc.coordinates[1],
            population: city.population,
        });
    });

    rows.sort(function (a, b) { return a.geoname_id - b.geoname_id; });
    return { rows: rows, dropped: dropped };
}

// --- SQL ---------------------------------------------------------------------

/** Управляющие символы: в названии города им взяться неоткуда, оператор ломают. */
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f]', 'g');

/**
 * Текст в литерал SQL.
 *
 * Одинарная кавычка удваивается — это единственный способ экранирования,
 * который не зависит от настройки standard_conforming_strings.
 */
function sqlText(value) {
    return "'" + String(value).replace(CONTROL_CHARS, ' ').replace(/'/g, "''") + "'";
}

function sqlJson(value) {
    return sqlText(JSON.stringify(value)) + '::jsonb';
}

/**
 * Пакует контур страны так же, как это делает прототип: приращения координат
 * в сотых долях градуса, Int16, плюс длины колец.
 *
 * ЗАЧЕМ. В колонке `outline` лежит обычный MultiPolygon в координатах — так
 * решено в схеме, и менять это не нужно. Но 32 тысячи точек в виде текста
 * это 470 КБ, а единственный канал загрузки — MCP-коннектор Supabase, через
 * который SQL идёт текстом. Упакованный вид втрое короче, и Postgres
 * разворачивает его обратно сам (`nf_unpack_outline` ниже). В базу всё равно
 * ложится MultiPolygon: пакуется только дорога туда.
 */
function packOutline(outline) {
    const lon = [];
    const lat = [];
    const polys = outline.map(function (rings) {
        return rings.map(function (ring) {
            let prevLon = 0;
            let prevLat = 0;
            ring.forEach(function (point) {
                const lo = Math.round(point[0] * 100);
                const la = Math.round(point[1] * 100);
                lon.push(wrapLon(lo - prevLon));
                lat.push(la - prevLat);
                prevLon = lo;
                prevLat = la;
            });
            return ring.length;
        });
    });

    const check = [lon, lat].every(function (values) {
        return values.every(function (v) { return v >= -32768 && v <= 32767; });
    });
    if (!check) throw new Error('приращение координат не влезает в Int16');

    return {
        polys: polys,
        lon: Buffer.from(Int16Array.from(lon).buffer).toString('base64'),
        lat: Buffer.from(Int16Array.from(lat).buffer).toString('base64'),
    };
}

function countryValues(row) {
    const packed = packOutline(row.outline);
    return '(' + [
        sqlText(row.code),
        sqlJson(row.names),
        row.lat,
        row.lng,
        row.spread,
        row.land_share,
        'public.nf_unpack_outline(' + sqlJson(packed.polys) + ',' +
            sqlText(packed.lon) + ',' + sqlText(packed.lat) + ')',
    ].join(',') + ')';
}

function cityValues(row) {
    return '(' + [
        row.geoname_id,
        sqlText(row.name),
        sqlText(row.country_code),
        row.lat,
        row.lng,
        row.population,
    ].join(',') + ')';
}

const COUNTRY_HEAD =
    'insert into public.countries (code, names, lat, lng, spread, land_share, outline) values\n';
const COUNTRY_TAIL =
    '\non conflict (code) do update set names = excluded.names, lat = excluded.lat, ' +
    'lng = excluded.lng, spread = excluded.spread, land_share = excluded.land_share, ' +
    'outline = excluded.outline;';

/**
 * Помощник на время загрузки: разворачивает упакованный контур обратно
 * в MultiPolygon. Создаётся перед загрузкой, удаляется после неё — в схеме
 * проекта его нет и быть не должно, это инструмент, а не часть модели.
 *
 * Алгоритм — тот же, что в `unpackOutlines` выше, слово в слово: приращения
 * складываются, долгота заворачивается в -180..180 через линию перемены дат.
 */
const HELPER_SQL = [
    'create or replace function public.nf_unpack_outline(polys jsonb, lon_b64 text, lat_b64 text)',
    'returns jsonb',
    'language plpgsql',
    'immutable',
    'security invoker',
    "set search_path = ''",
    'as $fn$',
    'declare',
    "    lon_bytes bytea := decode(lon_b64, 'base64');",
    "    lat_bytes bytea := decode(lat_b64, 'base64');",
    '    idx int := 0;',
    '    lon int;',
    '    lat int;',
    '    delta int;',
    '    ring_len int;',
    "    all_polys text := '';",
    "    poly_parts text;",
    "    ring_parts text;",
    '    i int;',
    '    j int;',
    '    k int;',
    'begin',
    '    for i in 0 .. jsonb_array_length(polys) - 1 loop',
    "        poly_parts := '';",
    '        for j in 0 .. jsonb_array_length(polys -> i) - 1 loop',
    '            ring_len := (polys -> i ->> j)::int;',
    "            ring_parts := '';",
    '            lon := 0;',
    '            lat := 0;',
    '            for k in 1 .. ring_len loop',
    '                delta := get_byte(lon_bytes, idx * 2) + get_byte(lon_bytes, idx * 2 + 1) * 256;',
    '                if delta > 32767 then delta := delta - 65536; end if;',
    '                lon := ((lon + delta) % 36000 + 36000 + 18000) % 36000 - 18000;',
    '                delta := get_byte(lat_bytes, idx * 2) + get_byte(lat_bytes, idx * 2 + 1) * 256;',
    '                if delta > 32767 then delta := delta - 65536; end if;',
    '                lat := lat + delta;',
    '                idx := idx + 1;',
    "                ring_parts := ring_parts || ',[' || (lon::float8 / 100)::text",
    "                    || ',' || (lat::float8 / 100)::text || ']';",
    '            end loop;',
    "            poly_parts := poly_parts || ',[' || substr(ring_parts, 2) || ']';",
    '        end loop;',
    "        all_polys := all_polys || ',[' || substr(poly_parts, 2) || ']';",
    '    end loop;',
    "    return ('[' || substr(all_polys, 2) || ']')::jsonb;",
    'end',
    '$fn$;',
    '',
].join('\n');

const DROP_HELPER_SQL =
    'drop function if exists public.nf_unpack_outline(jsonb, text, text);\n';

const CITY_HEAD =
    'insert into public.geo_cities (geoname_id, name, country_code, lat, lng, population) values\n';
const CITY_TAIL =
    '\non conflict (geoname_id) do update set name = excluded.name, ' +
    'country_code = excluded.country_code, lat = excluded.lat, lng = excluded.lng, ' +
    'population = excluded.population;';

/**
 * Режет строки на операторы и пишет их файлами с номерами.
 *
 * Ограничения два, и оба обязательны. По числу строк — чтобы оператор оставался
 * читаемым. По размеру — потому что страны очень разные: контур Канады длиннее
 * контура Андорры в сотню раз, и пачка «по 40 стран» получилась бы то на 10 КБ,
 * то на 200 КБ. Приёмник (SQL-редактор, коннектор) ограничен по размеру запроса,
 * поэтому решает тот предел, который наступил раньше.
 */
function writeBatches(outDir, prefix, rows, toValues, head, tail, batchSize, maxBytes) {
    const files = [];
    let chunk = [];
    let bytes = 0;

    function flush() {
        if (chunk.length === 0) return;
        const sql = head + chunk.join(',\n') + tail + '\n';
        const name = prefix + '-' + String(files.length + 1).padStart(2, '0') + '.sql';
        fs.writeFileSync(path.join(outDir, name), sql);
        files.push({ file: name, rows: chunk.length, bytes: Buffer.byteLength(sql) });
        chunk = [];
        bytes = 0;
    }

    rows.forEach(function (row) {
        const values = toValues(row);
        const size = Buffer.byteLength(values) + 2;
        if (chunk.length > 0 && (chunk.length >= batchSize || bytes + size > maxBytes)) flush();
        chunk.push(values);
        bytes += size;
    });
    flush();
    return files;
}

function main() {
    const args = parseArgs(process.argv);
    if (!args.data || !args.modules || !args.out) {
        throw new Error('нужны --data=<data.json> --modules=<node_modules> --out=<каталог>');
    }

    const batchSize = args.batch ? parseInt(args.batch, 10) : DEFAULT_BATCH;
    const maxBytes = args['max-bytes'] ? parseInt(args['max-bytes'], 10) : DEFAULT_MAX_BYTES;
    const countryBatch = args['country-batch']
        ? parseInt(args['country-batch'], 10)
        : Math.max(1, Math.round(batchSize / COUNTRY_BATCH_DIVISOR));
    const data = JSON.parse(fs.readFileSync(args.data, 'utf8'));
    const allCities = require(path.join(path.resolve(args.modules), 'all-the-cities'));

    fs.mkdirSync(args.out, { recursive: true });

    fs.writeFileSync(path.join(args.out, 'helper-create.sql'), HELPER_SQL);
    fs.writeFileSync(path.join(args.out, 'helper-drop.sql'), DROP_HELPER_SQL);

    const countries = buildCountries(data);
    const codes = new Set(countries.rows.map(function (r) { return r.code; }));
    const cities = buildGeoCities(allCities, codes);

    const manifest = {
        source: path.resolve(args.data),
        cityMinPopulation: CITY_MIN_POP,
        countries: countries.rows.length,
        countriesSkippedNoIsoCode: countries.skipped,
        countriesMergedDuplicates: countries.merged,
        countriesSkippedNoGeometry: countries.noGeometry,
        geoCities: cities.rows.length,
        geoCitiesDropped: cities.dropped,
        countryFiles: writeBatches(
            args.out, 'countries', countries.rows, countryValues,
            COUNTRY_HEAD, COUNTRY_TAIL, countryBatch, maxBytes
        ),
        cityFiles: writeBatches(
            args.out, 'geo-cities', cities.rows, cityValues,
            CITY_HEAD, CITY_TAIL, batchSize, maxBytes
        ),
    };

    fs.writeFileSync(path.join(args.out, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n');
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
}

main();
