/**
 * Точечно дозаполняет написания городов через Nominatim (OpenStreetMap).
 *
 * ГРАНИЦА, КОТОРУЮ ЭТОТ СКРИПТ НЕ ПЕРЕХОДИТ. Условия публичного сервера
 * nominatim.openstreetmap.org («Nominatim Usage Policy») запрещают не только
 * частые запросы, но и систематический обход справочника как таковой:
 *
 *   «Systematic queries This includes reverse queries in a grid, searching
 *    for complete lists of postcodes, towns etc. and downloading all POIs
 *    in an area.»
 *
 *   «Use that is directly triggered by the end-user (for example, user
 *    searches for something) is ok, provided that your number of users
 *    is moderate.»
 *
 *   «No heavy uses (an absolute maximum of 1 request per second).»
 *
 * То есть «медленно» не превращает обход девяти тысяч городов в разрешённый:
 * запрещён сам обход списка, а не темп. Поэтому здесь есть жёсткий потолок
 * порции (MAX_BATCH) и порядок обхода «сперва то, что продукту нужно» —
 * города из `cities`, потом крупнейшие. Широкое покрытие даёт не этот скрипт,
 * а `tools/geo/build-city-names.js` из Natural Earth, где обязательств нет.
 *
 * ЛИЦЕНЗИЯ РЕЗУЛЬТАТА. Всё, что приходит отсюда, — данные OpenStreetMap под
 * ODbL: хранить и публиковать можно, атрибуция обязательна. Она уже выведена
 * в подвале публичных страниц (ADR-0006). В базе источник записывается
 * в `geo_cities.names_source = 'nominatim'`.
 *
 * ПОЧЕМУ СКРИПТ НЕ ПИШЕТ В БАЗУ САМ. Запись закрыта политиками RLS, входа нет
 * (техдолг №1 в CLAUDE.md). Скрипт складывает результат в SQL-файл, который
 * применяется через MCP-коннектор Supabase или редактор SQL — тем же путём,
 * что и остальное наполнение.
 *
 * СОСТОЯНИЕ И ПОВТОРНЫЙ ЗАПУСК. Что уже собрано, знает база
 * (`names_checked_at` не пуст — значит спрашивали). Пока сгенерированный SQL
 * не применён, тот же ответ помнит журнал рядом с выводом, поэтому обрыв
 * связи на середине порции не приводит к повторному опросу тех же городов.
 *
 * Запуск:
 *
 *   node tools/geo/fill-city-names.js --out=<каталог> [--limit=25] [--delay=1500]
 *
 * Ключи:
 *   --limit    сколько городов опросить за запуск (по умолчанию 25, потолок 200)
 *   --delay    пауза между запросами в миллисекундах (по умолчанию 1500)
 *   --out      куда положить SQL и журнал (обязателен)
 *   --dry-run  сходить в Nominatim, но SQL не писать — для проверки отбора
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Языки интерфейса. Порядок — как в NF.i18n.LANGS. */
const LANGS = ['ru', 'en', 'zh', 'es', 'ar', 'hi', 'pt', 'fr', 'de', 'ja'];

/**
 * Потолок порции. Не настройка, а предохранитель: с ним нельзя случайно
 * (или «просто на ночь») превратить точечное дозаполнение в обход справочника,
 * который условия Nominatim запрещают отдельным пунктом.
 */
const MAX_BATCH = 200;

const DEFAULT_BATCH = 25;

/**
 * Пауза между запросами, миллисекунды.
 *
 * Условия называют абсолютным максимумом один запрос в секунду. Полторы
 * секунды — запас на то, что таймер и сеть считают время по-разному:
 * упереться в предел ровно означает регулярно его превышать.
 */
const DEFAULT_DELAY_MS = 1500;

/**
 * Честный User-Agent — прямое требование условий: «Provide a valid HTTP
 * Referer or User-Agent identifying the application (stock User-Agents as set
 * by http libraries will not do)».
 */
const USER_AGENT = 'NowhereFast/0.1 (+https://github.com/Masreniy/nowhere-fast)';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/**
 * Насколько далеко от координат справочника может лежать ответ, километры.
 *
 * Это и есть подтверждение личности объекта: одноимённых городов много,
 * и без проверки координатами скрипт записал бы городу чужое написание.
 * Порог тот же, что у широкого слоя, — «та же агломерация».
 */
const MATCH_RADIUS_KM = 25;

/** Сколько городов из `cities` берём в приоритет. Их единицы, но предел нужен. */
const PRODUCT_CITY_LIMIT = 100;

/** Окно поиска пары «продуктовый город → справочный», градусы. */
const PRODUCT_MATCH_WINDOW_DEG = 0.5;

const EARTH_RADIUS_KM = 6371;

// --- Аргументы и конфигурация -----------------------------------------------

function parseArgs(argv) {
    const args = {};
    argv.slice(2).forEach(function (raw) {
        const match = /^--([^=]+)=(.*)$/.exec(raw);
        if (match) args[match[1]] = match[2];
        else if (raw.startsWith('--')) args[raw.slice(2)] = true;
    });
    return args;
}

/**
 * Ключи берутся из assets/js/config.js, а не из копии рядом.
 * По CLAUDE.md config.js — единственное место, где они записаны.
 */
function readConfig() {
    const file = path.join(__dirname, '..', '..', 'assets', 'js', 'config.js');
    const source = fs.readFileSync(file, 'utf8');
    const url = /SUPABASE_URL:\s*'([^']+)'/.exec(source);
    const key = /SUPABASE_KEY:\s*'([^']+)'/.exec(source);
    if (!url || !key) throw new Error('Не нашёл SUPABASE_URL/SUPABASE_KEY в ' + file);
    return { url: url[1], key: key[1] };
}

// --- Координаты -------------------------------------------------------------

function toRadians(deg) {
    return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// --- Чтение из Supabase (только чтение: запись закрыта RLS) -----------------

async function restGet(config, pathAndQuery) {
    const response = await fetch(config.url + '/rest/v1/' + pathAndQuery, {
        headers: { apikey: config.key, Authorization: 'Bearer ' + config.key },
    });
    if (!response.ok) {
        throw new Error('Supabase ответил ' + response.status + ' на ' + pathAndQuery);
    }
    return response.json();
}

/**
 * Города, которые продукту нужны прямо сейчас: те, что заведены в `cities`.
 *
 * Пара со справочником ищется по стране и координатам, а не по имени:
 * ADR-0010 прямо называет имя ненадёжной связкой между двумя источниками.
 */
async function productCityIds(config) {
    const cities = await restGet(
        config,
        'cities?select=country_code,lat,lng&lat=not.is.null&lng=not.is.null&limit=' + PRODUCT_CITY_LIMIT
    );

    const ids = [];
    for (const city of cities) {
        if (!city.country_code) continue;
        const window = PRODUCT_MATCH_WINDOW_DEG;
        const query = 'geo_cities?select=geoname_id,lat,lng'
            + '&country_code=eq.' + encodeURIComponent(city.country_code)
            + '&lat=gte.' + (city.lat - window) + '&lat=lte.' + (city.lat + window)
            + '&lng=gte.' + (city.lng - window) + '&lng=lte.' + (city.lng + window)
            + '&names=is.null&names_checked_at=is.null';
        const near = await restGet(config, query);

        let best = null;
        let bestDistance = Infinity;
        near.forEach(function (row) {
            const distance = distanceKm(city.lat, city.lng, row.lat, row.lng);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = row;
            }
        });
        if (best && bestDistance <= MATCH_RADIUS_KM) ids.push(best.geoname_id);
    }
    return ids;
}

/** Очередь дозаполнения: не пробовали, крупные вперёд. */
async function pendingCities(config, limit) {
    return restGet(
        config,
        'geo_cities?select=geoname_id,name,country_code,lat,lng,population'
        + '&names=is.null&names_checked_at=is.null'
        + '&order=population.desc&limit=' + limit
    );
}

async function citiesByIds(config, ids) {
    if (ids.length === 0) return [];
    return restGet(
        config,
        'geo_cities?select=geoname_id,name,country_code,lat,lng,population'
        + '&geoname_id=in.(' + ids.join(',') + ')'
    );
}

// --- Nominatim --------------------------------------------------------------

/**
 * Ошибка, после которой продолжать нельзя: сервер прямо сказал «хватит».
 * Дальнейшие запросы в этом случае — уже не вежливость, а игнорирование отказа.
 */
class StopRun extends Error {}

async function askNominatim(city) {
    const url = NOMINATIM + '?' + new URLSearchParams({
        city: city.name,
        countrycodes: String(city.country_code).toLowerCase(),
        format: 'jsonv2',
        namedetails: '1',
        limit: '5',
    }).toString();

    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

    if (response.status === 429 || response.status === 403) {
        throw new StopRun('Nominatim ответил ' + response.status + ' — запуск остановлен.');
    }
    if (!response.ok) throw new Error('Nominatim ответил ' + response.status);

    return response.json();
}

/** Из ответа берётся только тот объект, который подтверждён координатами. */
function pickMatch(results, city) {
    let best = null;
    let bestDistance = Infinity;

    (results || []).forEach(function (item) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const distance = distanceKm(city.lat, city.lng, lat, lng);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = item;
        }
    });

    return bestDistance <= MATCH_RADIUS_KM ? best : null;
}

/**
 * Написания из namedetails: только явно помеченные языком ключи `name:xx`.
 *
 * Безымянный `name` сюда не идёт: это местное написание без указания языка,
 * и приписать его какому-то из десяти — значит выдумать факт (ADR-0003).
 */
function namesFrom(match) {
    const details = (match && match.namedetails) || {};
    const names = {};
    LANGS.forEach(function (lang) {
        const value = details['name:' + lang];
        if (typeof value === 'string' && value.trim()) names[lang] = value.trim();
    });
    return Object.keys(names).length > 0 ? names : null;
}

// --- Журнал -----------------------------------------------------------------

/**
 * Журнал нужен на промежуток между «опросили» и «применили SQL»: в базе
 * отметки ещё нет, и без журнала повторный запуск после обрыва пошёл бы
 * за теми же городами второй раз — ровно то, чего условия просят не делать.
 */
function loadJournal(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Журнал не прочитан, начинаю с чистого:', error.message);
        }
        return { asked: {} };
    }
}

function saveJournal(file, journal) {
    fs.writeFileSync(file, JSON.stringify(journal, null, 2));
}

// --- SQL --------------------------------------------------------------------

function literal(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

function statementFor(row) {
    if (!row.names) {
        return 'update public.geo_cities set names_checked_at = now()'
            + ' where geoname_id = ' + row.geonameId + ' and names is null;';
    }
    return 'update public.geo_cities set names = ' + literal(JSON.stringify(row.names)) + '::jsonb,'
        + " names_checked_at = now(), names_source = 'nominatim'"
        + ' where geoname_id = ' + row.geonameId + ';';
}

function writeSql(file, rows) {
    const header = [
        '-- Написания городов, добытые точечно через Nominatim (OpenStreetMap).',
        '-- Собрано tools/geo/fill-city-names.js. ЛИЦЕНЗИЯ: ODbL, атрибуция обязательна.',
        '-- Строки без names — это «спрашивали, источник не дал»: дата ставится,',
        '-- чтобы дозаполнитель не пришёл за тем же городом снова.',
        '',
    ].join('\n');
    fs.writeFileSync(file, header + rows.map(statementFor).join('\n') + '\n');
}

// --- Отбор порции -----------------------------------------------------------

/** Сперва то, что нужно продукту, потом крупные. Дубли и спрошенное отсеиваются. */
async function selectBatch(config, journal, limit) {
    const priorityIds = await productCityIds(config);
    const priority = await citiesByIds(config, priorityIds);
    const rest = await pendingCities(config, limit * 2);

    const seen = new Set();
    const batch = [];

    priority.concat(rest).forEach(function (city) {
        if (batch.length >= limit) return;
        const id = String(city.geoname_id);
        if (seen.has(id) || journal.asked[id]) return;
        seen.add(id);
        batch.push(city);
    });

    return batch;
}

// --- Точка входа ------------------------------------------------------------

async function main() {
    const args = parseArgs(process.argv);
    if (!args.out) throw new Error('Не задан обязательный ключ --out. См. шапку файла.');

    const limit = Number(args.limit) || DEFAULT_BATCH;
    if (limit > MAX_BATCH) {
        throw new Error(
            'Порция ' + limit + ' больше потолка ' + MAX_BATCH + '. Условия Nominatim '
            + 'запрещают систематический обход списка городов, а не только частые запросы. '
            + 'Широкое покрытие берётся из Natural Earth: tools/geo/build-city-names.js'
        );
    }
    const delay = Number(args.delay) || DEFAULT_DELAY_MS;
    const outDir = args.out;
    fs.mkdirSync(outDir, { recursive: true });

    const config = readConfig();
    const journalFile = path.join(outDir, 'city-names-journal.json');
    const journal = loadJournal(journalFile);

    const batch = await selectBatch(config, journal, limit);
    if (batch.length === 0) {
        process.stdout.write('Очередь пуста: все города либо с написаниями, либо уже спрошены.\n');
        return;
    }

    const rows = [];
    let stopped = null;

    for (const city of batch) {
        try {
            const results = await askNominatim(city);
            const match = pickMatch(results, city);
            const names = match ? namesFrom(match) : null;
            rows.push({ geonameId: city.geoname_id, names: names });
            journal.asked[String(city.geoname_id)] = new Date().toISOString();
            saveJournal(journalFile, journal);
            process.stdout.write(
                (names ? 'есть ' + Object.keys(names).length + ' яз.' : 'пусто     ')
                + '  ' + city.name + ' (' + city.country_code + ')\n'
            );
        } catch (error) {
            if (error instanceof StopRun) { stopped = error; break; }
            // Сетевой сбой — не ответ источника. Город остаётся неспрошенным
            // и вернётся в очередь следующим запуском.
            console.error('Nowhere Fast: пропускаю ' + city.name + ':', error.message);
        }

        await sleep(delay);
    }

    if (!args['dry-run'] && rows.length > 0) {
        const file = path.join(outDir, 'city-names-nominatim.sql');
        writeSql(file, rows);
        process.stdout.write('\nSQL: ' + file + ' (' + rows.length + ' строк)\n');
        process.stdout.write('Применить через MCP-коннектор Supabase или редактор SQL.\n');
    }

    if (stopped) {
        console.error('Nowhere Fast:', stopped.message);
        process.exitCode = 1;
    }
}

main().catch(function (error) {
    console.error('Nowhere Fast: дозаполнение не выполнено:', error.message);
    process.exitCode = 1;
});
