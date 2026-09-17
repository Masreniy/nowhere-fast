/**
 * Заливает готовый SQL справочника (`countries`, `geo_cities`) в базу — сам,
 * до конца, с возобновлением после обрыва.
 *
 * ЗАЧЕМ ОН ПОЯВИЛСЯ. До сих пор наполнение шло по схеме «скрипт собирает SQL —
 * человек или агент применяет его по кусочкам». Для пятидесяти мест Гуанчжоу
 * это нормально. Для справочника это 17 порций городов и 10 порций стран,
 * и каждая порция — отдельное действие с подтверждением. Работа при этом
 * не идёт: она ждёт. Здесь та же заливка делается одной командой и не требует
 * присутствия — можно запустить и уйти.
 *
 * ПОЧЕМУ ЭТОМУ СКРИПТУ МОЖНО ПИСАТЬ В БАЗУ, А `fill-city-names.js` НЕЛЬЗЯ.
 * Разные двери. Фронтенд ходит в Supabase публикуемым ключом, и там
 * единственная граница безопасности — RLS: записи нет ни у кого, пока нет
 * входа (`.claude/rules/security.md`, правило 1). Этот скрипт — не фронтенд.
 * Он подключается прямой строкой Postgres из переменной окружения
 * SUPABASE_DB_URL, то есть тем же путём, что редактор SQL в панели Supabase
 * или MCP-коннектор. Это администраторский путь наполнения, он и раньше был
 * единственным рабочим (техдолг №1 в CLAUDE.md).
 *
 * Отсюда жёсткое следствие: строка подключения НИКОГДА не попадает в код,
 * в репозиторий и в браузер. Только переменная окружения, только на машине
 * владельца или на сервере. Скрипт отказывается работать, если её нет,
 * и никогда не печатает её содержимое — даже в сообщении об ошибке.
 *
 * ВОЗОБНОВЛЕНИЕ БЕЗ ЖУРНАЛА. Обрыв на середине — обычное дело, и переживать
 * его должен сам скрипт, а не память того, кто его запускал. Отдельной таблицы
 * «что уже применено» здесь нет намеренно: журнал умеет расходиться с тем,
 * что на самом деле лежит в базе, и тогда он врёт увереннее, чем его
 * отсутствие. Вместо журнала перед каждой порцией спрашиваем саму базу,
 * сколько её ключей уже на месте. Совпало с числом строк — порция применена,
 * пропускаем. Порция применяется одним оператором, то есть либо целиком,
 * либо никак, — промежуточного состояния, в котором такая проверка солгала
 * бы, не существует.
 *
 * ПОРЯДОК. Страны идут раньше городов: у `geo_cities.country_code` внешний
 * ключ на `countries`, и один недостающий код обрушит весь оператор на
 * пятьсот строк. Вокруг стран выполняются `helper-create.sql`
 * и `helper-drop.sql` — временная функция распаковки контуров, без неё
 * операторы стран не выполнятся.
 *
 * Запуск:
 *
 *   export SUPABASE_DB_URL='postgresql://...'   # панель Supabase → Connect
 *   node tools/geo/load-reference.js --sql=<каталог с SQL>
 *
 * Ключи:
 *   --sql      каталог, куда build-reference-sql.js положил SQL (обязателен)
 *   --only     countries | cities | names — залить только одну часть справочника
 *   --pause    пауза между порциями в миллисекундах (по умолчанию 500)
 *   --force    не пропускать уже применённые порции, залить всё заново
 *   --dry-run  разобрать файлы и напечатать план, в базу не ходить
 *
 * Прерывание по Ctrl+C не рвёт текущую порцию: скрипт доводит её до конца
 * и выходит. Повторный запуск продолжит с того места, где остановились.
 *
 * КОГДА НУЖЕН `--force`. Возобновление считает порцию применённой по наличию
 * ключей — но ключ может лежать в базе со **старым или испорченным**
 * значением. Именно для этого случая порции собраны как
 * `insert … on conflict do update`: повторная заливка чинит строку. Без
 * `--force` до этого `update` дело не дойдёт никогда — порция будет
 * пропущена как «уже в базе». Так уже случилось на деле: в базе нашлись семь
 * стран со `spread` из более ранней сборки, и починить их повторным запуском
 * без ключа было нельзя.
 *
 * Поэтому правило простое: **обычный запуск — продолжить прерванное,
 * `--force` — привести базу к источнику.** Порции идемпотентны, лишнего
 * `--force` не портит, он только дольше.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Пауза между порциями. Не защита от лимитов, а вежливость к маленькой базе. */
const DEFAULT_PAUSE_MS = 500;

/** Потолок паузы: больше минуты между порциями — это уже не заливка, а ошибка в ключе. */
const MAX_PAUSE_MS = 60000;

const HELPER_CREATE = 'helper-create.sql';
const HELPER_DROP = 'helper-drop.sql';

/**
 * Как узнать вид порции по имени файла и чем проверять, применена ли она.
 *
 * `keySource` — строка, а не готовое регулярное выражение: выражение с флагом
 * `g` хранит `lastIndex` между вызовами, и общий экземпляр начал бы со второго
 * раза читать файл с середины.
 */
const KINDS = {
    countries: {
        prefix: 'countries-',
        table: 'public.countries',
        statement: 'insert into',
        keyColumn: 'code',
        keyType: 'text[]',
        keySource: "^\\('([A-Z]{2})',",
        castKey: function (raw) { return raw; }
    },
    cities: {
        prefix: 'geo-cities-',
        table: 'public.geo_cities',
        statement: 'insert into',
        keyColumn: 'geoname_id',
        keyType: 'bigint[]',
        keySource: '^\\((\\d+),',
        castKey: function (raw) { return Number(raw); }
    },
    // Написания — не вставка, а update уже существующих городов. Поэтому
    // «ключ на месте» здесь ничего не значит: город лежит в базе с самого
    // начала. Признак применённой порции другой — у города появились names.
    names: {
        prefix: 'city-names-',
        table: 'public.geo_cities',
        statement: 'update ',
        keyColumn: 'geoname_id',
        keyType: 'bigint[]',
        keySource: '^\\s*\\((\\d+), ',
        appliedWhen: ' and names is not null',
        castKey: function (raw) { return Number(raw); }
    }
};

/** Порядок: страны раньше городов из-за внешнего ключа, написания — после городов. */
const KIND_ORDER = ['countries', 'cities', 'names'];

function kindOf(fileName) {
    const names = Object.keys(KINDS);
    for (let i = 0; i < names.length; i++) {
        if (fileName.indexOf(KINDS[names[i]].prefix) === 0) {
            return names[i];
        }
    }
    return null;
}

/**
 * Разбирает порцию: какой она половины, какие ключи в ней лежат.
 *
 * Ключи нужны не ради красоты отчёта, а ради возобновления: по ним база
 * отвечает, применена порция или нет.
 */
function parseChunk(fileName, text) {
    const kind = kindOf(fileName);
    if (!kind) {
        return null;
    }
    const statement = KINDS[kind].statement;
    if (text.indexOf(statement) < 0) {
        throw new Error('в файле ' + fileName + ' нет оператора ' + statement.trim());
    }
    const pattern = new RegExp(KINDS[kind].keySource, 'gm');
    const keys = [];
    let match = pattern.exec(text);
    while (match) {
        keys.push(KINDS[kind].castKey(match[1]));
        match = pattern.exec(text);
    }
    if (keys.length === 0) {
        throw new Error('в файле ' + fileName + ' не нашлось ни одной строки данных');
    }
    // Повтор ключа внутри порции ломает возобновление навсегда: база вернёт
    // число различных ключей, оно никогда не сравняется с числом строк,
    // и порция будет заливаться заново при каждом запуске. Данным это
    // не вредит, поэтому находка тихая — и именно поэтому её надо назвать.
    if (new Set(keys).size !== keys.length) {
        throw new Error('в файле ' + fileName + ' ключ встречается дважды; ' +
            'возобновление на такой порции работать не будет');
    }
    return { file: fileName, kind: kind, keys: keys, rows: keys.length, sql: text };
}

/** Читает каталог: порции отдельно, две вспомогательные функции отдельно. */
function readChunks(dir) {
    const files = fs.readdirSync(dir).filter(function (name) {
        return name.slice(-4) === '.sql';
    }).sort();
    const chunks = [];
    const helpers = {};
    files.forEach(function (name) {
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        if (name === HELPER_CREATE || name === HELPER_DROP) {
            helpers[name] = text;
            return;
        }
        const chunk = parseChunk(name, text);
        if (chunk) {
            chunks.push(chunk);
        }
    });
    if (chunks.length === 0) {
        throw new Error('в каталоге ' + dir + ' не нашлось порций справочника');
    }
    return { chunks: chunks, helpers: helpers };
}

/** Сортирует порции: сперва страны, потом города, внутри — по имени файла. */
function orderChunks(chunks, only) {
    return chunks.filter(function (chunk) {
        return !only || chunk.kind === only;
    }).slice().sort(function (a, b) {
        const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
        return byKind !== 0 ? byKind : a.file.localeCompare(b.file);
    });
}

function parseArgs(argv) {
    const options = { sqlDir: null, only: null, pause: DEFAULT_PAUSE_MS,
        force: false, dryRun: false, problem: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.indexOf('--sql=') === 0) {
            options.sqlDir = arg.slice('--sql='.length);
        } else if (arg.indexOf('--only=') === 0) {
            options.only = arg.slice('--only='.length);
        } else if (arg.indexOf('--pause=') === 0) {
            options.pause = Number(arg.slice('--pause='.length));
        } else if (arg === '--force') {
            options.force = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else {
            options.problem = 'непонятный ключ: ' + arg;
            return options;
        }
    }
    if (!options.sqlDir) {
        options.problem = 'не указан --sql=<каталог с SQL>';
    } else if (options.only && KIND_ORDER.indexOf(options.only) < 0) {
        options.problem = '--only принимает только ' + KIND_ORDER.join(', ');
    } else if (!(options.pause >= 0) || options.pause > MAX_PAUSE_MS) {
        options.problem = '--pause должен быть от 0 до ' + MAX_PAUSE_MS + ' миллисекунд';
    }
    return options;
}

function pause(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * `pg` требуется лениво: тесты разбирают файлы и план, не подключаясь к базе,
 * и не должны падать на отсутствующей зависимости.
 */
function openClient(url) {
    let pg;
    try {
        pg = require('pg');
    } catch (error) {
        throw new Error('не установлен драйвер pg: выполни npm install в tools/geo');
    }
    return new pg.Client({ connectionString: url });
}

/** Сколько ключей порции уже лежит в базе. Совпало с числом строк — порция применена. */
async function loadedKeyCount(client, chunk) {
    const kind = KINDS[chunk.kind];
    const sql = 'select count(*)::int as n from ' + kind.table +
        ' where ' + kind.keyColumn + ' = any($1::' + kind.keyType + ')' +
        (kind.appliedWhen || '');
    const result = await client.query(sql, [chunk.keys]);
    return result.rows[0].n;
}

function printPlan(chunks) {
    let rows = 0;
    chunks.forEach(function (chunk) {
        rows += chunk.rows;
        process.stdout.write(chunk.file + ' — ' + chunk.kind + ', строк: ' + chunk.rows + '\n');
    });
    process.stdout.write('итого порций: ' + chunks.length + ', строк: ' + rows + '\n');
}

/** Одна порция: пропустить, применить или сообщить об ошибке. Возвращает исход. */
async function applyChunk(client, chunk, index, total, force) {
    const label = '[' + (index + 1) + '/' + total + '] ' + chunk.file;
    const present = await loadedKeyCount(client, chunk);
    if (!force && present === chunk.rows) {
        process.stdout.write(label + ' — уже в базе, пропуск\n');
        return 'skipped';
    }
    const startedAt = Date.now();
    try {
        await client.query(chunk.sql);
    } catch (error) {
        process.stdout.write(label + ' — ОШИБКА: ' + error.message + '\n');
        return 'failed';
    }
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(label + ' — строк ' + chunk.rows + ', было ' + present +
        ', готово за ' + seconds + ' с\n');
    // Оператор мог пройти и не тронуть ни одной строки: update по городам,
    // которых ещё нет, ошибкой не считается. Молчаливый ноль хуже ошибки,
    // поэтому пересчитываем и говорим вслух.
    const after = await loadedKeyCount(client, chunk);
    if (after < chunk.rows) {
        process.stdout.write(label + ' — ВНИМАНИЕ: в базе оказалось ' + after +
            ' из ' + chunk.rows + '; порция применилась не полностью\n');
    }
    return 'applied';
}

/** Вспомогательная функция распаковки контуров: нужна только на время стран. */
async function runHelper(client, helpers, name) {
    if (!helpers[name]) {
        throw new Error('рядом с порциями стран нет ' + name);
    }
    await client.query(helpers[name]);
}

async function loadAll(client, chunks, helpers, options, stop) {
    const needsHelper = chunks.some(function (chunk) { return chunk.kind === 'countries'; });
    const tally = { applied: 0, skipped: 0, failed: 0, stopped: false };
    if (needsHelper) {
        await runHelper(client, helpers, HELPER_CREATE);
    }
    for (let i = 0; i < chunks.length; i++) {
        const outcome = await applyChunk(client, chunks[i], i, chunks.length, options.force);
        tally[outcome] += 1;
        if (stop.requested) {
            tally.stopped = true;
            break;
        }
        if (options.pause > 0 && i < chunks.length - 1) {
            await pause(options.pause);
        }
    }
    if (needsHelper) {
        await runHelper(client, helpers, HELPER_DROP);
    }
    return tally;
}

function reportTally(tally) {
    process.stdout.write('\nприменено: ' + tally.applied +
        ', пропущено: ' + tally.skipped +
        ', с ошибкой: ' + tally.failed + '\n');
    if (tally.stopped) {
        process.stdout.write('остановлено по Ctrl+C — запусти ту же команду, ' +
            'она продолжит с непройденных порций\n');
    }
    if (tally.failed > 0) {
        process.stdout.write('часть порций не легла. Частая причина — недостающая ' +
            'страна: у городов внешний ключ на countries\n');
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.problem) {
        process.stderr.write(options.problem + '\n');
        return 2;
    }
    const read = readChunks(options.sqlDir);
    const chunks = orderChunks(read.chunks, options.only);
    if (options.dryRun) {
        printPlan(chunks);
        return 0;
    }
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
        process.stderr.write('нет переменной окружения SUPABASE_DB_URL. ' +
            'Строку подключения даёт панель Supabase (Connect → ORMs/psql). ' +
            'В репозиторий она не кладётся никогда.\n');
        return 2;
    }
    const stop = { requested: false };
    process.on('SIGINT', function () {
        if (stop.requested) {
            process.exit(130);
        }
        stop.requested = true;
        process.stdout.write('\nостановлюсь после текущей порции; ещё раз Ctrl+C — оборву сразу\n');
    });
    const client = openClient(url);
    await client.connect();
    let tally;
    try {
        tally = await loadAll(client, chunks, read.helpers, options, stop);
    } finally {
        await client.end();
    }
    reportTally(tally);
    return tally.failed > 0 ? 1 : 0;
}

module.exports = { kindOf: kindOf, parseChunk: parseChunk, orderChunks: orderChunks, parseArgs: parseArgs };

if (require.main === module) {
    main().then(function (code) {
        process.exitCode = code;
    }, function (error) {
        process.stderr.write(String(error && error.message ? error.message : error) + '\n');
        process.exitCode = 1;
    });
}
