/**
 * Проверка астрономии глобуса.
 *
 * Зачем этот тест. Терминатор дня и ночи, поворот неба и положение Луны —
 * единственное на странице глобуса, что человек сверяет с окном. Ошибка здесь
 * не падает с исключением: она молча сдвигает границу дня, и понять это можно
 * только по числам.
 *
 * Откуда взяты опорные значения. Прототип (tools прототипа, verify.mjs) сверял
 * эти же формулы с пакетом astronomy-engine — библиотекой, которая считает то
 * же самое по полной теории. Числа ниже — её ответ на четыре фиксированные
 * даты: видимые геоцентрические экваториальные координаты даты (GeoVector
 * с поправкой на время света, повёрнутый в экватор даты) и звёздное время
 * SiderealTime. Сам пакет в зависимости проекта не берём: он нужен один раз,
 * чтобы получить эталон, а не на каждом прогоне.
 *
 * Допуски — те же, что были приняты в прототипе, и с большим запасом к тому,
 * что формулы дают сейчас (в скобках — фактический максимум на сорока датах
 * 2020–2031 при последней сверке):
 *
 *   Солнце         0,05°   (0,0078°)
 *   Луна           0,5°    (0,0781°)
 *   фаза Луны      2 %     (0,18 %)
 *   звёздное время 0,01°   (0,0042°)
 *
 * Половина градуса по Луне — это её видимый поперечник: ошибка крупнее уже
 * заметна глазом на небе.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/** Поднимает чистый документ и загружает в него astro.js. */
function setup() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only',
    });
    const win = dom.window;
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/globe/astro.js'), 'utf8'));
    return win.NF.globeAstro;
}

const DEG = 180 / Math.PI;

/** Угол между двумя направлениями на небе, градусы. Аргументы в радианах. */
function angleBetween(ra1, dec1, ra2, dec2) {
    const a = [Math.cos(dec1) * Math.cos(ra1), Math.cos(dec1) * Math.sin(ra1), Math.sin(dec1)];
    const b = [Math.cos(dec2) * Math.cos(ra2), Math.cos(dec2) * Math.sin(ra2), Math.sin(dec2)];
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return Math.acos(Math.max(-1, Math.min(1, dot))) * DEG;
}

/** Разница углов по кругу: 359° и 1° расходятся на два градуса, а не на 358. */
function angleDiff(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
}

/**
 * Эталон astronomy-engine. ra и dec — градусы, gmst — градусы,
 * phase — доля освещённого диска.
 */
const REFERENCE = [
    {
        iso: '2020-01-01T00:00:00Z',
        sun: { ra: 280.8888, dec: -23.0587 },
        moon: { ra: 349.1687, dec: -9.9748 },
        phase: 0.2995,
        gmst: 100.1176,
    },
    {
        // День полного солнечного затмения над Северной Америкой: Солнце
        // и Луна в одной точке неба, фаза ноль. Если бы Луна считалась
        // от другой эпохи, расхождение здесь было бы видно сразу.
        iso: '2024-04-08T18:18:00Z',
        sun: { ra: 17.9041, dec: 7.5918 },
        moon: { ra: 17.7458, dec: 7.9022 },
        phase: 0.0000,
        gmst: 111.9963,
        subsolar: { lat: 7.5918, lng: -94.0922 },
    },
    {
        iso: '2026-09-16T12:00:00Z',
        sun: { ra: 174.1682, dec: 2.5223 },
        moon: { ra: 234.0576, dec: -24.7190 },
        phase: 0.2826,
        gmst: 175.4529,
        subsolar: { lat: 2.5223, lng: -1.2847 },
    },
    {
        iso: '2031-06-21T18:30:00Z',
        sun: { ra: 90.2261, dec: 23.4335 },
        moon: { ra: 111.2046, dec: 17.8403 },
        phase: 0.0315,
        gmst: 187.2622,
    },
];

const SUN_TOLERANCE_DEG = 0.05;
const MOON_TOLERANCE_DEG = 0.5;
const PHASE_TOLERANCE = 0.02;
const GMST_TOLERANCE_DEG = 0.01;
const SUBSOLAR_TOLERANCE_DEG = 0.05;

// --- Солнце ------------------------------------------------------------------

test('положение Солнца не расходится с полной теорией больше чем на 0,05°', () => {
    const astro = setup();

    REFERENCE.forEach((row) => {
        const sun = astro.sunPosition(new Date(row.iso));
        const error = angleBetween(sun.ra, sun.dec, row.sun.ra / DEG, row.sun.dec / DEG);
        assert.ok(error <= SUN_TOLERANCE_DEG,
            row.iso + ': Солнце разошлось на ' + error.toFixed(4) + '°');
    });
});

test('подсолнечная точка совпадает с эталоном по широте и долготе', () => {
    const astro = setup();

    REFERENCE.filter((row) => row.subsolar).forEach((row) => {
        const point = astro.subsolarPoint(new Date(row.iso));
        assert.ok(Math.abs(point.lat - row.subsolar.lat) <= SUBSOLAR_TOLERANCE_DEG,
            row.iso + ': широта подсолнечной точки ' + point.lat.toFixed(4));
        assert.ok(angleDiff(point.lng, row.subsolar.lng) <= SUBSOLAR_TOLERANCE_DEG,
            row.iso + ': долгота подсолнечной точки ' + point.lng.toFixed(4));
    });
});

test('в июньское солнцестояние Солнце над тропиком Рака, в декабрьское — Козерога', () => {
    const astro = setup();

    // Не сверка с эталоном, а защита от перепутанного знака: такую ошибку
    // допуск в сотые доли градуса не поймает, а зима с летом поменяются местами.
    const june = astro.subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    const december = astro.subsolarPoint(new Date('2026-12-21T12:00:00Z'));

    assert.ok(june.lat > 23.0 && june.lat < 23.5, 'июнь: широта ' + june.lat.toFixed(2));
    assert.ok(december.lat < -23.0 && december.lat > -23.5,
        'декабрь: широта ' + december.lat.toFixed(2));
});

// --- Луна ---------------------------------------------------------------------

test('положение Луны не расходится с полной теорией больше чем на её поперечник', () => {
    const astro = setup();

    REFERENCE.forEach((row) => {
        const moon = astro.moonPosition(new Date(row.iso));
        const error = angleBetween(moon.ra, moon.dec, row.moon.ra / DEG, row.moon.dec / DEG);
        assert.ok(error <= MOON_TOLERANCE_DEG,
            row.iso + ': Луна разошлась на ' + error.toFixed(4) + '°');
    });
});

test('фаза Луны совпадает с эталоном с точностью до двух процентов', () => {
    const astro = setup();

    REFERENCE.forEach((row) => {
        const moon = astro.moonPosition(new Date(row.iso));
        assert.ok(Math.abs(moon.illuminated - row.phase) <= PHASE_TOLERANCE,
            row.iso + ': фаза ' + moon.illuminated.toFixed(4) + ', ждали ' + row.phase);
    });
});

test('расстояние до Луны отдаётся в радиусах Земли и лежит в пределах орбиты', () => {
    const astro = setup();

    // Сценой это число используется для параллакса: Луна всего в 60 радиусах
    // Земли, и для наблюдателя на поверхности направление отличается от
    // геоцентрического почти на градус. Если единицы измерения поедут,
    // параллакс развернёт Луну куда угодно, а ошибка останется тихой.
    REFERENCE.forEach((row) => {
        const moon = astro.moonPosition(new Date(row.iso));
        assert.ok(moon.distance > 55 && moon.distance < 64,
            row.iso + ': расстояние ' + moon.distance.toFixed(2) + ' радиусов Земли');
    });
});

// --- Звёздное время -------------------------------------------------------------

test('звёздное время совпадает с эталоном с точностью до сотой градуса', () => {
    const astro = setup();

    REFERENCE.forEach((row) => {
        const mine = astro.gmst(new Date(row.iso)) * DEG;
        const error = angleDiff(mine, row.gmst);
        assert.ok(error <= GMST_TOLERANCE_DEG,
            row.iso + ': звёздное время разошлось на ' + error.toFixed(4) + '°');
    });
});

test('за звёздные сутки небо поворачивается ровно на круг', () => {
    const astro = setup();

    // Звёздные сутки короче солнечных на 3 минуты 56 секунд — на этом
    // и держится вся картина неба. Проверяем не эталоном, а свойством.
    const start = new Date('2026-09-16T00:00:00Z');
    const siderealDayMs = 86164090;
    const later = new Date(start.getTime() + siderealDayMs);

    const turn = angleDiff(astro.gmst(start) * DEG, astro.gmst(later) * DEG);
    assert.ok(turn < 0.01, 'за звёздные сутки набежало ' + turn.toFixed(4) + '°');
});

// --- Согласованность -------------------------------------------------------------

test('дни от эпохи J2000 считаются от полудня 1 января 2000 года', () => {
    const astro = setup();

    // Эпоха J2000.0 — это 2000-01-01 12:00 UTC. Полдня сдвига здесь означают
    // 0,5° по Солнцу и 6° по Луне: ровно та ошибка, которую сверка ловила
    // у элементов лунной орбиты.
    assert.ok(Math.abs(astro.daysSinceJ2000(new Date('2000-01-01T12:00:00Z'))) < 1e-6);
    assert.ok(Math.abs(astro.julianDay(new Date('2000-01-01T12:00:00Z')) - 2451545) < 1e-6);
});

test('единичный вектор по экваториальным координатам держит ось мира', () => {
    const astro = setup();

    // Y — ось вращения Земли: у полюса мира вектор смотрит строго вверх.
    const pole = astro.equatorialToVector(0, Math.PI / 2);
    assert.ok(Math.abs(pole[1] - 1) < 1e-9, 'полюс мира не по оси Y: ' + pole.join(', '));

    // Точка весеннего равноденствия — ось X.
    const aries = astro.equatorialToVector(0, 0);
    assert.ok(Math.abs(aries[0] - 1) < 1e-9, 'точка Овна не по оси X: ' + aries.join(', '));
});
