/**
 * Растрирует Землю в две текстуры для глобуса. Никаких точек: настоящая карта.
 *
 * На выходе (равнопромежуточная проекция, `assets/img/globe/`):
 *   earth.jpg   — цвет поверхности, 4096×2048, снимок NASA Blue Marble
 *   surface.jpg — 2048×1024, три карты данных по каналам:
 *                 R — рельеф (карта высот), G — ночные огни, B — маска суши
 *
 * Чего здесь нет намеренно: карты стран (`index.png` прототипа). Определение
 * страны по клику делается по контурам на стороне сцены, а не чтением пикселя,
 * поэтому растр стран нужен только как источник маски суши и в проект не едет.
 *
 * Источники: NASA Blue Marble, ночные огни и карта высот приходят вместе
 * с пакетом three-globe (общественное достояние); контуры стран —
 * Natural Earth через world-atlas. Атрибуция — в NOTICE и в подвале страницы.
 *
 * Запуск: npm run build:globe-textures (из корня репозитория).
 * Считается минуты три; растр стран кладётся в кэш tools/globe/.cache/.
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const topojson = require('topojson-client');
const jpeg = require('jpeg-js');

const toolDir = __dirname;
const repoDir = path.resolve(toolDir, '..', '..');
const outDir = path.join(repoDir, 'assets', 'img', 'globe');
const cacheDir = path.join(toolDir, '.cache');

const W = Number(process.env.TEX_W) || 4096, H = Number(process.env.TEX_H) || 2048;   // 0.088° на пиксель ≈ 10 км
const IW = W / 2, IH = H / 2;              // карта данных вдвое грубее — этого хватает
const CELL = 2;

const topo = require('world-atlas/countries-50m.json');
const fc = topojson.feature(topo, topo.objects.countries);

/* --- пространственный индекс полигонов ------------------------------------ */

const index = new Map();
const key = (lon, lat) => `${Math.floor(lon / CELL)}:${Math.floor(lat / CELL)}`;

// Кольцо, пересекающее линию перемены дат, в плоских координатах вырождается
// в отрезок через всю карту — отсюда ложные заливки. Разворачиваем такое
// кольцо в пространство 0..360, где оно снова связное.
function unwrapRing(ring) {
    let w = 180, e = -180, w2 = 360, e2 = 0;
    for (const [lon] of ring) {
        if (lon < w) w = lon;
        if (lon > e) e = lon;
        const l2 = lon < 0 ? lon + 360 : lon;
        if (l2 < w2) w2 = l2;
        if (l2 > e2) e2 = l2;
    }
    // Разворачиваем только если он реально помогает. У Антарктиды кольцо
    // охватывает все 360° в обоих пространствах: там разворот всё ломает.
    const shifted = (e2 - w2) < (e - w) - 60;
    return {
        shifted,
        points: shifted ? ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : ring,
    };
}

// Полярный полигон (Антарктида) замыкается отрезком вдоль самого полюса.
// В плоскости широта-долгота такой контур не замкнут, и проверка «точка
// внутри» не работает. Проецируем его на плоскость вокруг полюса: там
// береговая линия становится обычным замкнутым кольцом.
const D2R = Math.PI / 180;

function isPolarRing(ring) {
    let minAbs = 90, w = 180, e = -180;
    for (const [lon, lat] of ring) {
        minAbs = Math.min(minAbs, Math.abs(lat));
        if (lon < w) w = lon;
        if (lon > e) e = lon;
    }
    return minAbs > 89 && (e - w) > 350;
}

const projectPolar = (lon, lat, south) =>
    [(south ? 90 + lat : 90 - lat) * Math.cos(lon * D2R),
     (south ? 90 + lat : 90 - lat) * Math.sin(lon * D2R)];

function polarRing(ring, south) {
    return ring.map(([lon, lat]) => projectPolar(lon, lat, south));
}

function pointInPlainRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function ringBox(ring) {
    let w = 180, e = -180, s = 90, n = -90;
    for (const [lon, lat] of ring) {
        if (lon < w) w = lon; if (lon > e) e = lon;
        if (lat < s) s = lat; if (lat > n) n = lat;
    }
    return { w, e, s, n };
}

function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

fc.features.forEach((feature, idx) => {
    const polys = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    polys.forEach((poly) => {
        const polarIdx = poly.findIndex(isPolarRing);
        let ref;
        if (polarIdx >= 0) {
            // Настоящий контур — то кольцо, что не лежит на полюсе.
            const coast = poly.find((r, k) => k !== polarIdx) || poly[polarIdx];
            const south = coast[0][1] < 0;
            ref = {
                idx, polar: true, south,
                ring: polarRing(coast, south),
                box: { w: -180, e: 180, s: south ? -90 : 60, n: south ? -60 : 90 },
            };
        } else {
            const outer = unwrapRing(poly[0]);
            ref = {
                idx,
                shifted: outer.shifted,
                outer: outer.points,
                holes: poly.slice(1).map((h) => unwrapRing(h).points),
                box: ringBox(outer.points),
            };
        }
        for (let lon = Math.floor(ref.box.w / CELL) * CELL; lon <= ref.box.e; lon += CELL) {
            for (let lat = Math.floor(ref.box.s / CELL) * CELL; lat <= ref.box.n; lat += CELL) {
                const l = ref.shifted && lon >= 180 ? lon - 360 : lon;
                const k = key(l + 0.001, lat + 0.001);
                if (!index.has(k)) index.set(k, []);
                index.get(k).push(ref);
            }
        }
    });
});

function countryAt(lon, lat) {
    const bucket = index.get(key(lon, lat));
    if (!bucket) return -1;
    for (const ref of bucket) {
        if (ref.polar) {
            if (ref.south ? lat > -60 : lat < 60) continue;
            const [px, py] = projectPolar(lon, lat, ref.south);
            if (pointInPlainRing(px, py, ref.ring)) return ref.idx;
            continue;
        }
        const l = ref.shifted && lon < 0 ? lon + 360 : lon;
        const b = ref.box;
        if (l < b.w || l > b.e || lat < b.s || lat > b.n) continue;
        if (!pointInRing(l, lat, ref.outer)) continue;
        if (ref.holes.some((h) => pointInRing(l, lat, h))) continue;
        return ref.idx;
    }
    return -1;
}

/* --- растр стран: нужен только ради маски суши ------------------------------ */

// Маска суши считается по контурам, а не по цвету снимка: на снимке лёд,
// облака и мелководье не отличаются от берега, а маска двоичная и от неё
// зависят блики по воде и затенение рельефом только по земле.
fs.mkdirSync(cacheDir, { recursive: true });
const cachePath = path.join(cacheDir, `raster-${W}x${H}.bin`);
let raster;
if (fs.existsSync(cachePath) && !process.env.TEX_FORCE) {
    raster = new Int16Array(fs.readFileSync(cachePath).buffer.slice(0));
    console.log('растр стран взят из кэша');
} else {
    console.time('растр стран');
    raster = new Int16Array(W * H);
    for (let y = 0; y < H; y++) {
        const lat = 90 - ((y + 0.5) / H) * 180;
        for (let x = 0; x < W; x++) {
            const lon = ((x + 0.5) / W) * 360 - 180;
            raster[y * W + x] = countryAt(lon, lat);
        }
    }
    console.timeEnd('растр стран');
    fs.writeFileSync(cachePath, Buffer.from(raster.buffer));
}

/* --- цвет: снимок NASA ------------------------------------------------------ */

// Blue Marble и ночные огни — съёмка NASA (общественное достояние),
// приходят вместе с пакетом three-globe. Рисовать карту руками смысла нет:
// настоящий снимок выглядит как Земля, а не как атлас 1900 года.
const imgPath = (f) => path.join(toolDir, 'node_modules', 'three-globe', 'example', 'img', f);

const blueMarble = jpeg.decode(fs.readFileSync(imgPath('earth-blue-marble.jpg')),
    { useTArray: true });
const nightLights = jpeg.decode(fs.readFileSync(imgPath('earth-night.jpg')),
    { useTArray: true });

// Карта высот той же съёмки: по ней считается рельефная тень. Снимок сам по
// себе плоский, а горы и хребты — это как раз то, чего в нём не хватает.
const topology = PNG.sync.read(fs.readFileSync(imgPath('earth-topology.png')));

if (blueMarble.width !== W || blueMarble.height !== H) {
    console.warn(`снимок ${blueMarble.width}×${blueMarble.height}, растр ${W}×${H} — масштабирую`);
}

const waterMask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) waterMask[i] = raster[i] >= 0 ? 255 : 0;

/** Билинейная выборка из декодированного изображения. */
function sample(img, u, v) {
    const x = Math.min(img.width - 1, Math.max(0, Math.round(u * img.width)));
    const y = Math.min(img.height - 1, Math.max(0, Math.round(v * img.height)));
    const o = (y * img.width + x) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
}

/* --- карта данных: рельеф, огни, суша ---------------------------------------- */

// Три карты данных лежат в одной текстуре — по каналу на карту:
//   R — рельеф (карта высот), G — ночные огни, B — маска суши.
// Порознь это были три RGBA-текстуры по 8–10 МиБ видеопамяти каждая, причём
// шейдер брал из каждой ровно один канал. Одна общая экономит 18,7 МиБ и
// заодно сокращает выборки на пиксель: центр даёт сразу огни, маску и высоту.
// JPEG здесь честен: у jpeg-js нет прореживания цветности (4:4:4), а маска
// двоичная и порог 127 переживает кольцевание кодека без единой ошибки
// (проверяется ниже, а не предполагается).
// Чёрный уровень красного канала снимка: над сушей без городов он держится
// в пределах 13, над океаном — 1. Всё ниже порога светом не является.
const NIGHT_FLOOR = 14;
const NIGHT_GAIN = 255 / (255 - NIGHT_FLOOR);

const surfaceRgba = Buffer.alloc(IW * IH * 4);
for (let y = 0; y < IH; y++) {
    for (let x = 0; x < IW; x++) {
        const o = (y * IW + x) * 4;

        const sx = Math.min(topology.width - 1,
            Math.round(((x + 0.5) / IW) * topology.width));
        const sy = Math.min(topology.height - 1,
            Math.round(((y + 0.5) / IH) * topology.height));
        surfaceRgba[o] = topology.data[(sy * topology.width + sx) * 4];

        // Ночные огни берём из красного канала, а не из max(r,g,b).
        // В снимке NASA фон — не чернота, а густо-синий: над открытым
        // океаном это (1, 19, 43), над Сахарой (13, 57, 80). Максимум по
        // каналам ловил именно этот синий фон и красил всю ночную сторону
        // ровным коричневым светом «городов» там, где городов нет.
        // Настоящие огни почти нейтральны: Токио (98, 100, 109),
        // Москва (91, 94, 91). Красный канал разделяет их начисто.
        const [r] = sample(nightLights, (x + 0.5) / IW, (y + 0.5) / IH);
        surfaceRgba[o + 1] = Math.min(255, Math.round(Math.max(0, r - NIGHT_FLOOR) * NIGHT_GAIN));

        // Маска суши в синем канале, а не в альфе: при чтении через canvas
        // премультипликация стирает цвет у пикселей с нулевой альфой.
        surfaceRgba[o + 2] = waterMask[(y * 2) * W + x * 2];
        surfaceRgba[o + 3] = 255;
    }
}

/* --- кодирование и запись ---------------------------------------------------- */

fs.mkdirSync(outDir, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(0)} КБ`;

console.time('кодирование');

// Пережимаем снимок: в исходнике качество выше, чем нужно шару на экране,
// а каждый килобайт уезжает посетителю по сети.
const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
        const [r, g, b] = sample(blueMarble, (x + 0.5) / W, (y + 0.5) / H);
        const o = (y * W + x) * 4;
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
}
const jpg = jpeg.encode({ data: rgba, width: W, height: H }, 76);
fs.writeFileSync(path.join(outDir, 'earth.jpg'), jpg.data);

const surfaceJpg = jpeg.encode({ data: surfaceRgba, width: IW, height: IH }, 82);
fs.writeFileSync(path.join(outDir, 'surface.jpg'), surfaceJpg.data);

console.timeEnd('кодирование');

// Маска суши обязана пережить кодек — на ней держатся блики по воде
// и затенение рельефом только по земле. Проверяем, а не надеемся.
const back = jpeg.decode(surfaceJpg.data, { useTArray: true });
let flipped = 0;
for (let i = 0; i < IW * IH; i++) {
    if ((surfaceRgba[i * 4 + 2] > 127) !== (back.data[i * 4 + 2] > 127)) flipped++;
}
if (flipped) throw new Error(`маска суши испорчена кодеком: ${flipped} пикселей`);
console.log(`маска суши: 0 расхождений из ${IW * IH}`);

// Огни должны гореть в городах и молчать в пустыне и в океане.
const lightAt = (lat, lng) => {
    const x = Math.round((lng + 180) / 360 * IW);
    const y = Math.round((90 - lat) / 180 * IH);
    return back.data[(y * IW + x) * 4 + 1];
};
const spots = [
    ['Токио', 35.7, 139.7], ['Москва', 55.75, 37.6],
    ['Индийский океан', 0, 80], ['Сахара', 22, 25], ['Амазония', -3, -62],
];
console.log('огни: ' + spots.map(([n, a, o]) => `${n} ${lightAt(a, o)}`).join(', '));

console.log(`earth.jpg:   ${jpg.data.length} Б (${kb(jpg.data.length)}), ${W}×${H}`);
console.log(`surface.jpg: ${surfaceJpg.data.length} Б (${kb(surfaceJpg.data.length)}), ${IW}×${IH}`);
console.log(`→ ${outDir}`);
