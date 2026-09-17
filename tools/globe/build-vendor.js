/**
 * Собирает assets/vendor/globe-engine.js — движок глобуса одним классическим
 * скриптом.
 *
 * Почему сборка, а не CDN: у `three@0.186` UMD-сборки нет вовсе, пакет только
 * ESM, а страницы проекта подключают скрипты тегами без `type="module"`.
 * Готовая UMD-сборка `three-globe` есть, но весит 4 МБ — внутрь запечён движок
 * WebGPU, которого в сцене нет. Подробности — в tools/globe/README.md.
 *
 * Запуск: npm run build:globe-vendor (из корня репозитория).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const esbuild = require('esbuild');

const toolDir = __dirname;
const repoDir = path.resolve(toolDir, '..', '..');
const outFile = path.join(repoDir, 'assets', 'vendor', 'globe-engine.js');

/**
 * Шапка файла. Она нужна не для красоты: без неё первый же человек, увидевший
 * 300 КБ минифицированного кода в репозитории, попробует его починить руками.
 */
const HEADER = [
    '/*!',
    ' * Nowhere Fast — движок глобуса: three ' + version('three')
        + ' + three-globe ' + version('three-globe')
        + ' + three-geojson-geometry ' + version('three-geojson-geometry') + '.',
    ' *',
    ' * ЭТОТ ФАЙЛ СОБРАН АВТОМАТИЧЕСКИ. Руками не правится: любая правка',
    ' * пропадёт при следующей пересборке.',
    ' *',
    ' * Чем собрано: esbuild ' + version('esbuild') + ', bundle + minify,',
    ' * format iife, target es2019. Точка входа — tools/globe/src/vendor-entry.js.',
    ' * Пересобрать: npm run build:globe-vendor',
    ' *',
    ' * Выкладывает наружу: NF.three, NF.ThreeGlobe, NF.GeoJsonGeometry.',
    ' *',
    ' * Лицензии исходных пакетов — MIT, тексты и атрибуция в NOTICE.',
    ' */',
    '',
].join('\n');

function version(pkg) {
    return require(path.join(toolDir, 'node_modules', pkg, 'package.json')).version;
}

const result = esbuild.buildSync({
    entryPoints: [path.join(toolDir, 'src', 'vendor-entry.js')],
    // three-globe тянет `three/webgpu` и `three/tsl` ради слоя тайловой карты,
    // а `h3-js` ради гексбинов. Ни того, ни другого в сцене нет: 900 КБ
    // мёртвого кода в файле и 40 МБ кучи на его разбор. Подменяем заглушкой —
    // отрисовка при этом байт в байт та же, проверено в браузере.
    alias: {
        'three/webgpu': path.join(toolDir, 'src', 'stub-unused.js'),
        'three/tsl': path.join(toolDir, 'src', 'stub-unused.js'),
        'h3-js': path.join(toolDir, 'src', 'stub-unused.js'),
    },
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2019'],
    write: false,
    legalComments: 'none',
});

const bundle = HEADER + result.outputFiles[0].text;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, bundle);

const bytes = Buffer.byteLength(bundle);
const gzip = zlib.gzipSync(Buffer.from(bundle), { level: 9 }).length;
const kb = function (n) { return (n / 1024).toFixed(0) + ' КБ'; };

console.log('globe-engine.js: ' + bytes + ' Б (' + kb(bytes) + ')');
console.log('gzip:            ' + gzip + ' Б (' + kb(gzip) + ')');
console.log('→ ' + outFile);
