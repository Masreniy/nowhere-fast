/**
 * Готовит assets/data/globe-stars.js — каталог звёзд и линии созвездий.
 *
 * Источник: d3-celestial (BSD-3-Clause) — каталог до 6-й звёздной величины,
 * собственные имена звёзд на десяти языках и линии созвездий.
 *
 * Почему файлом, а не таблицей в базе: это неизменяемый астрономический
 * справочник, а не данные продукта. Он не редактируется из админки, не зависит
 * от города и меняется только вместе с версией пакета — то есть при пересборке.
 * Держать его в базе значило бы платить запросом за то, что и так лежит рядом
 * со страницей.
 *
 * Упаковка: координаты и величины округлены и уложены в типизированные массивы,
 * массивы — в base64. В JSON те же числа занимали бы в несколько раз больше:
 * «[-53.12,-30.11],» — шестнадцать байт на точку, которая влезает в четыре.
 *
 * Запуск: npm run build:globe-stars (из корня репозитория).
 */
const fs = require('fs');
const path = require('path');

const toolDir = __dirname;
const repoDir = path.resolve(toolDir, '..', '..');
const outFile = path.join(repoDir, 'assets', 'data', 'globe-stars.js');

// Те же десять языков, что и у интерфейса проекта (см. docs/ACCEPTANCE-GLOBE.md, A2).
const LANGS = ['ru', 'en', 'zh', 'es', 'ar', 'hi', 'pt', 'fr', 'de', 'ja'];

// Подписываем только то, что человек реально видит и узнаёт: ярче 1.7m —
// это примерно полсотни звёзд, из которых складываются знакомые рисунки.
const NAMED_MAG_LIMIT = 1.7;

const b64 = (typed) => Buffer.from(typed.buffer).toString('base64');

/* --- звёзды ----------------------------------------------------------------- */

const starSrc = require('d3-celestial/data/stars.6.json').features;
const starNames = require('d3-celestial/data/starnames.json');

const starRa = new Uint16Array(starSrc.length);
const starDec = new Int16Array(starSrc.length);
const starMag = new Uint8Array(starSrc.length);
const starBv = new Int8Array(starSrc.length);
const named = [];

starSrc.forEach((f, i) => {
    let ra = f.geometry.coordinates[0];
    if (ra < 0) ra += 360;
    starRa[i] = Math.round((ra / 360) * 65535);
    starDec[i] = Math.round(f.geometry.coordinates[1] * 100);
    starMag[i] = Math.max(0, Math.min(255, Math.round((f.properties.mag + 2) * 25)));
    starBv[i] = Math.max(-128, Math.min(127, Math.round(parseFloat(f.properties.bv || 0) * 50)));

    if (f.properties.mag < NAMED_MAG_LIMIT) {
        const rec = starNames[f.id];
        if (rec && rec.name) {
            const names = {};
            LANGS.forEach((l) => { names[l] = rec[l] || rec.name; });
            named.push({ ra: +ra.toFixed(3), dec: +f.geometry.coordinates[1].toFixed(3), names });
        }
    }
});

/* --- линии созвездий --------------------------------------------------------- */

const linesSrc = require('d3-celestial/data/constellations.lines.json').features;
const lineRa = [];
const lineDec = [];
const lineLens = [];
linesSrc.forEach((f) => {
    f.geometry.coordinates.forEach((seg) => {
        lineLens.push(seg.length);
        seg.forEach(([ra, dec]) => {
            lineRa.push(Math.round(((ra < 0 ? ra + 360 : ra) / 360) * 65535));
            lineDec.push(Math.round(dec * 100));
        });
    });
});

/* --- проверка распаковки ------------------------------------------------------ */

// Упаковка без обратной проверки — это гипотеза. Разворачиваем прямой угол
// обратно и сверяем с исходником: 16-битная сетка по прямому восхождению даёт
// шаг 0,0055°, по склонению — сотая градуса. Всё, что грубее, — ошибка упаковки,
// а не потеря точности.
const RA_STEP = 360 / 65535;
let worstRa = 0;
let worstDec = 0;
starSrc.forEach((f, i) => {
    let ra = f.geometry.coordinates[0];
    if (ra < 0) ra += 360;
    worstRa = Math.max(worstRa, Math.abs((starRa[i] / 65535) * 360 - ra));
    worstDec = Math.max(worstDec, Math.abs(starDec[i] / 100 - f.geometry.coordinates[1]));
});
if (worstRa > RA_STEP || worstDec > 0.005 + 1e-9) {
    throw new Error(`распаковка звёзд расходится: ra ${worstRa}°, dec ${worstDec}°`);
}

/* --- запись ------------------------------------------------------------------- */

const payload = {
    count: starSrc.length,
    ra: b64(starRa),
    dec: b64(starDec),
    mag: b64(starMag),
    bv: b64(starBv),
    named,
    constellations: {
        ra: b64(Uint16Array.from(lineRa)),
        dec: b64(Int16Array.from(lineDec)),
        lens: b64(Uint16Array.from(lineLens)),
    },
};

const HEADER = [
    '/*!',
    ' * Nowhere Fast — звёзды и созвездия для страницы глобуса.',
    ' *',
    ' * ЭТОТ ФАЙЛ СОБРАН АВТОМАТИЧЕСКИ. Руками не правится: любая правка',
    ' * пропадёт при следующей пересборке.',
    ' * Пересобрать: npm run build:globe-stars (tools/globe/build-stars.js).',
    ' *',
    ' * Почему не в базе: это неизменяемый астрономический справочник, а не',
    ' * данные продукта. Он не заводится из админки, не зависит от города и',
    ' * меняется только вместе с версией пакета-источника. Продуктовые данные —',
    ' * страны, города, места — живут в Supabase; звёзды туда не идут.',
    ' *',
    ' * Источник: d3-celestial ' + require(path.join(toolDir, 'node_modules', 'd3-celestial', 'package.json')).version
        + ' (BSD-3-Clause), каталог до 6-й величины.',
    ' *',
    ' * Упаковка: типизированные массивы в base64.',
    ' *   ra   Uint16 — прямое восхождение, доля от 360°: ra = v / 65535 * 360',
    ' *   dec  Int16  — склонение в сотых градуса: dec = v / 100',
    ' *   mag  Uint8  — звёздная величина: mag = v / 25 - 2',
    ' *   bv   Int8   — показатель цвета: bv = v / 50',
    ' *   constellations.lens — длины сегментов линий, подряд по ra/dec',
    ' */',
    'window.NF = window.NF || {};',
    'NF.globeStars = ',
].join('\n');

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, HEADER + JSON.stringify(payload) + ';\n');

const bytes = fs.statSync(outFile).size;
const kb = (n) => `${(n / 1024).toFixed(0)} КБ`;

console.log(`звёзд:           ${starSrc.length}, из них подписаны ${named.length}`);
console.log(`линий созвездий: ${lineLens.length} сегментов, ${lineRa.length} точек`);
console.log(`распаковка:      ra ≤ ${worstRa.toFixed(5)}°, dec ≤ ${worstDec.toFixed(5)}°`);
console.log(`globe-stars.js:  ${bytes} Б (${kb(bytes)})`);
console.log(`gzip:            ${require('zlib').gzipSync(fs.readFileSync(outFile), { level: 9 }).length} Б`);
console.log(`→ ${outFile}`);
