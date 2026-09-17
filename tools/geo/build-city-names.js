/**
 * Готовит SQL для написаний городов на десяти языках (`geo_cities.names`).
 *
 * ЗАЧЕМ. Справочник `geo_cities` приходит из GeoNames через `all-the-cities`,
 * а тот отдаёт только латиницу: поле `altName` пусто у всех 135 233 записей
 * пакета (проверено чтением `cities.pbf`). При русском интерфейсе «Москва»
 * в поиске не находится — находится «Moscow». ADR-0010 записал это как
 * ограничение источника; этот генератор его закрывает широким слоем.
 *
 * ИСТОЧНИК И ЛИЦЕНЗИЯ — читать до того, как что-то отсюда публиковать:
 *
 *   Natural Earth, слой 10m populated places      ОБЩЕСТВЕННОЕ ДОСТОЯНИЕ
 *   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/
 *       geojson/ne_10m_populated_places.geojson
 *
 * Natural Earth уже выбран проектом для очертаний стран (ADR-0010) и не
 * накладывает обязательств: «no permission is needed to use Natural Earth,
 * crediting the authors is unnecessary». Атрибуцию всё равно указываем —
 * в NOTICE, рядом с очертаниями.
 *
 * Тот же слой хранит поля NAME_RU, NAME_EN, NAME_ZH, NAME_ES, NAME_AR,
 * NAME_HI, NAME_PT, NAME_FR, NAME_DE, NAME_JA — ровно десять языков проекта,
 * заполненные у всех 7342 записей, и GEONAMESID, по которому запись
 * связывается со справочником точно, а не по совпадению имени.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ. Написания не переводятся, не транслитерируются
 * и не достраиваются — только переносятся из источника (ADR-0003, ADR-0006).
 * Город, которого в Natural Earth нет, остаётся латиницей и ждёт точечного
 * дозаполнения через `tools/geo/fill-city-names.js`.
 *
 * Запуск:
 *
 *   curl -sSL -o /tmp/ne10.geojson \
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
 *
 *   node tools/geo/build-city-names.js \
 *        --places=/tmp/ne10.geojson \
 *        --modules=<путь>/globe/node_modules \
 *        --out=<каталог для SQL>
 *
 * `--modules` — каталог node_modules с пакетом `all-the-cities`: из него берётся
 * тот же список городов, что залит в `geo_cities`, и по нему работает запасное
 * сопоставление (см. ниже). Ключи те же, что у `build-reference-sql.js`, чтобы
 * два генератора справочника запускались одинаково.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Языки интерфейса. Порядок — как в NF.i18n.LANGS. */
const LANGS = ['ru', 'en', 'zh', 'es', 'ar', 'hi', 'pt', 'fr', 'de', 'ja'];

/** Население, с которого город попадает в справочник. Как в build-reference-sql.js. */
const CITY_MIN_POP = 50000;

/**
 * Предел для запасного сопоставления по имени и координатам, километры.
 *
 * Запасное сопоставление нужно потому, что у одного и того же города Natural
 * Earth и GeoNames иногда держат РАЗНЫЕ идентификаторы GeoNames (у Natural
 * Earth они проставлены вручную и местами указывают на соседнюю запись).
 * Тогда связка по ключу не срабатывает, хотя город тот же самый.
 *
 * 25 км — это «та же городская агломерация»: центры двух соседних городов
 * такого размера расходятся дальше. Порог намеренно жёсткий: ошибочная
 * склейка даст городу чужое имя, а это хуже, чем оставить его латиницей.
 */
const MATCH_RADIUS_KM = 25;

/** Сколько строк уходит в один оператор update. */
const DEFAULT_BATCH = 300;

const EARTH_RADIUS_KM = 6371;

// --- Разбор аргументов ------------------------------------------------------

function parseArgs(argv) {
    const args = {};
    argv.slice(2).forEach(function (raw) {
        const match = /^--([^=]+)=(.*)$/.exec(raw);
        if (match) args[match[1]] = match[2];
        else if (raw.startsWith('--')) args[raw.slice(2)] = true;
    });
    return args;
}

function requireArg(args, name) {
    if (!args[name]) {
        throw new Error('Не задан обязательный ключ --' + name + '. См. шапку файла.');
    }
    return args[name];
}

// --- Работа с координатами --------------------------------------------------

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

/** Расстояние по большому кругу. Гаверсинус — как в NF.origin.distanceKm. */
function distanceKm(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Приводит имя к виду, по которому его сравнивают.
 *
 * Диакритика снимается (São Paulo и Sao Paulo — один город), регистр и
 * разделители тоже. Это сравнение ТОЛЬКО для поиска пары; в базу уходит
 * исходное написание источника, а не нормализованное.
 */
function normalizeName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// --- Чтение источника -------------------------------------------------------

/** Написания одной записи Natural Earth: десять языков или null, если пусто. */
function namesOf(props) {
    const names = {};
    let filled = 0;
    LANGS.forEach(function (lang) {
        const value = props['NAME_' + lang.toUpperCase()];
        if (typeof value === 'string' && value.trim()) {
            names[lang] = value.trim();
            filled += 1;
        }
    });
    return filled > 0 ? names : null;
}

/**
 * Разбирает слой Natural Earth в два указателя: по идентификатору GeoNames
 * и по коду страны (для запасного сопоставления).
 */
function readPlaces(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const byGeonameId = new Map();
    const byCountry = new Map();

    raw.features.forEach(function (feature) {
        const props = feature.properties;
        const names = namesOf(props);
        if (!names) return;

        const entry = {
            names: names,
            lat: props.LATITUDE,
            lng: props.LONGITUDE,
            keys: [normalizeName(props.NAMEASCII), normalizeName(props.NAME), normalizeName(props.NAME_EN)],
        };

        const geonameId = Number(props.GEONAMESID);
        if (Number.isFinite(geonameId) && geonameId > 0 && !byGeonameId.has(geonameId)) {
            byGeonameId.set(geonameId, entry);
        }

        const country = String(props.ISO_A2 || '').trim();
        if (country && country !== '-99') {
            if (!byCountry.has(country)) byCountry.set(country, []);
            byCountry.get(country).push(entry);
        }
    });

    return { byGeonameId: byGeonameId, byCountry: byCountry, total: raw.features.length };
}

/** Тот же отбор городов, что у build-reference-sql.js, — иначе списки разойдутся. */
function readReferenceCities(modulesDir) {
    const cities = require(path.join(modulesDir, 'all-the-cities'));
    return cities.filter(function (city) { return city.population >= CITY_MIN_POP; });
}

// --- Сопоставление ----------------------------------------------------------

/** Ищет в стране запись с тем же именем и ближайшими координатами. */
function findNearby(places, city) {
    const candidates = places.byCountry.get(city.country) || [];
    const key = normalizeName(city.name);
    const lat = city.loc.coordinates[1];
    const lng = city.loc.coordinates[0];

    let best = null;
    let bestDistance = Infinity;

    candidates.forEach(function (entry) {
        if (entry.keys.indexOf(key) === -1) return;
        const distance = distanceKm(lat, lng, entry.lat, entry.lng);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = entry;
        }
    });

    return bestDistance <= MATCH_RADIUS_KM ? best : null;
}

function matchCities(places, cities) {
    const matched = [];
    const stats = { byGeonameId: 0, byNearby: 0, unmatched: 0 };

    cities.forEach(function (city) {
        const geonameId = Number(city.cityId);
        const direct = places.byGeonameId.get(geonameId);
        if (direct) {
            stats.byGeonameId += 1;
            matched.push({ geonameId: geonameId, names: direct.names });
            return;
        }

        const nearby = findNearby(places, city);
        if (nearby) {
            stats.byNearby += 1;
            matched.push({ geonameId: geonameId, names: nearby.names });
            return;
        }

        stats.unmatched += 1;
    });

    return { matched: matched, stats: stats };
}

// --- Сборка SQL -------------------------------------------------------------

/** Строковый литерал Postgres: одинарная кавычка удваивается. */
function literal(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Один оператор на пачку городов.
 *
 * `and g.names is null` — чтобы широкий слой не затирал то, что уже добыл
 * точечный дозаполнитель: он ходит в OSM за городами, которых в Natural Earth
 * нет, и его результат дороже. Ключ --overwrite снимает это условие,
 * когда слой обновляют осознанно.
 */
function buildStatement(rows, overwrite) {
    const values = rows.map(function (row) {
        return '    (' + row.geonameId + ', ' + literal(JSON.stringify(row.names)) + ')';
    }).join(',\n');

    return [
        'update public.geo_cities as g',
        "set names = v.names::jsonb,",
        '    names_checked_at = now(),',
        "    names_source = 'natural-earth'",
        'from (values',
        values,
        ') as v(geoname_id, names)',
        'where g.geoname_id = v.geoname_id' + (overwrite ? '' : '\n  and g.names is null') + ';',
        '',
    ].join('\n');
}

const HEADER = [
    '-- Написания городов на десяти языках для public.geo_cities.',
    '-- Собрано tools/geo/build-city-names.js. Руками не править: правка',
    '-- разойдётся с источником, а источник переживёт эту правку.',
    '--',
    '-- ИСТОЧНИК: Natural Earth, слой 10m populated places.',
    '-- ЛИЦЕНЗИЯ: общественное достояние, обязательств нет. Атрибуция — в NOTICE.',
    '-- Написания перенесены из источника как есть; ничего не переведено',
    '-- и не транслитерировано (ADR-0003, ADR-0006).',
    '',
].join('\n');

function writeBatches(outDir, rows, batchSize, overwrite) {
    fs.mkdirSync(outDir, { recursive: true });
    const files = [];

    for (let start = 0, index = 1; start < rows.length; start += batchSize, index += 1) {
        const chunk = rows.slice(start, start + batchSize);
        const name = 'city-names-' + String(index).padStart(2, '0') + '.sql';
        fs.writeFileSync(path.join(outDir, name), HEADER + buildStatement(chunk, overwrite));
        files.push({ file: name, rows: chunk.length });
    }

    return files;
}

// --- Точка входа ------------------------------------------------------------

function main() {
    const args = parseArgs(process.argv);
    const placesFile = requireArg(args, 'places');
    const modulesDir = requireArg(args, 'modules');
    const outDir = requireArg(args, 'out');
    const batchSize = Number(args.batch) || DEFAULT_BATCH;
    const overwrite = Boolean(args.overwrite);

    const places = readPlaces(placesFile);
    const cities = readReferenceCities(modulesDir);
    const result = matchCities(places, cities);
    const files = writeBatches(outDir, result.matched, batchSize, overwrite);

    const perLanguage = {};
    LANGS.forEach(function (lang) { perLanguage[lang] = 0; });
    result.matched.forEach(function (row) {
        LANGS.forEach(function (lang) { if (row.names[lang]) perLanguage[lang] += 1; });
    });

    const manifest = {
        source: 'Natural Earth 10m populated places (public domain)',
        placesInSource: places.total,
        referenceCities: cities.length,
        matchedByGeonameId: result.stats.byGeonameId,
        matchedByNearby: result.stats.byNearby,
        matchRadiusKm: MATCH_RADIUS_KM,
        unmatched: result.stats.unmatched,
        perLanguage: perLanguage,
        overwrite: overwrite,
        files: files,
    };
    fs.writeFileSync(path.join(outDir, 'city-names-manifest.json'), JSON.stringify(manifest, null, 2));

    process.stdout.write(
        'Городов в справочнике: ' + cities.length + '\n'
        + 'Связано по идентификатору GeoNames: ' + result.stats.byGeonameId + '\n'
        + 'Связано по имени и координатам (<= ' + MATCH_RADIUS_KM + ' км): ' + result.stats.byNearby + '\n'
        + 'Останется латиницей: ' + result.stats.unmatched + '\n'
        + 'Файлов SQL: ' + files.length + '\n'
    );
}

main();
