/**
 * Контуры стран: границы для линий, полигоны для подъёма, страна по точке.
 *
 * Зачем модуль существует. Контуры приходят из базы (NF.api.listCountries,
 * поле outline — GeoJSON MultiPolygon), а сцене нужны две совсем разные вещи:
 * плоский список колец для одной геометрии границ и полигон конкретной страны,
 * чтобы поднять её над шаром. Плюс обратный вопрос — «что за страна под этой
 * точкой», по которому работают клик и наведение.
 *
 * Чем это отличается от прототипа. Там страна под точкой читалась из растровой
 * карты номеров (index.png, 8 МиБ пикселей): быстро, но карта — ещё один
 * артефакт, который надо собирать, класть рядом и держать в согласии с базой.
 * Здесь ответ считается по тем же контурам, что и рисуются, — данные одни,
 * рассогласоваться нечему.
 *
 * Три места, где наивная проверка «точка в многоугольнике» врёт, и что с ними
 * сделано (логика перенесена из прототипа, tools build-data.js):
 *
 *   1. Линия перемены дат. Кольцо Чукотки в плоскости широта-долгота
 *      вырождается в отрезок через всю карту, и точка у 180° приписывается
 *      то суше, то воде. Такое кольцо разворачивается в пространство 0…360,
 *      где оно снова связное, — вместе с проверяемой точкой.
 *   2. Полюс. Антарктида замыкается отрезком вдоль самой параллели -90°:
 *      в плоскости это незамкнутый контур. Береговая линия проецируется
 *      на плоскость вокруг полюса, там она становится обычным кольцом.
 *   3. Дырки. Лесото — дырка внутри ЮАР. Без проверки дырок точка в Масеру
 *      достаётся ЮАР, потому что её кольцо проверяется первым.
 *
 * Модуль чистый: ни document, ни THREE, ни сети — поэтому он покрыт тестами
 * в tests/globe-outlines.test.js, в отличие от остальной сцены.
 */
window.NF = window.NF || {};

NF.globeOutlines = (function () {
    'use strict';

    /**
     * Шаг ячейки пространственного индекса, градусы.
     *
     * Без индекса каждый клик — это проверка точки против всех контуров мира,
     * а наведение зовёт её на каждом движении мыши. Четыре градуса дают около
     * четырёх тысяч ячеек и десяток контуров в ячейке: перебор становится
     * незаметным, а памяти уходит меньше мегабайта.
     */
    const CELL_DEG = 4;

    /** Сдвиг при раскладке по ячейкам: снимает неоднозначность на границе. */
    const CELL_NUDGE = 0.001;

    /** Кольцо считается полярным, если оно всё у полюса и охватывает все долготы. */
    const POLAR_LAT_DEG = 89;
    const POLAR_SPAN_DEG = 350;

    /**
     * Разворот в 0…360 применяется, только если он реально помогает:
     * у Антарктиды кольцо охватывает все долготы в обоих пространствах,
     * и там разворот всё ломает.
     */
    const UNWRAP_GAIN_DEG = 60;

    /** Дальше этой широты полярный контур не проверяется вовсе. */
    const POLAR_GUARD_LAT = 60;

    const FULL_TURN = 360;
    const HALF_TURN = 180;
    const DEG = Math.PI / 180;

    // --- Разбор того, что пришло из базы ------------------------------------

    /**
     * Приводит поле outline к списку полигонов: полигон → кольца → точки.
     *
     * Из базы jsonb приходит объектом, но принимаем и строку, и «голые»
     * координаты, и Polygon вместо MultiPolygon: данные внешние, доверять
     * им слепо нельзя (coding-style, «валидация на границах»).
     */
    function polygonsOf(outline) {
        const value = parse(outline);
        if (!value) return [];

        const coords = Array.isArray(value) ? value : value.coordinates;
        if (!Array.isArray(coords) || !coords.length) return [];

        // MultiPolygon: [полигон][кольцо][точка][число]. Polygon на уровень мельче.
        const isPolygon = isPoint(coords[0] && coords[0][0]);
        const polygons = isPolygon ? [coords] : coords;

        return polygons.filter(isRingList);
    }

    function parse(outline) {
        if (typeof outline !== 'string') return outline || null;
        try {
            return JSON.parse(outline);
        } catch (err) {
            console.error('Nowhere Fast: контур страны не разобрался', err);
            return null;
        }
    }

    function isPoint(value) {
        return Array.isArray(value) && typeof value[0] === 'number';
    }

    function isRingList(poly) {
        return Array.isArray(poly) && poly.length > 0 && Array.isArray(poly[0])
            && isPoint(poly[0][0]);
    }

    // --- Геометрия колец ----------------------------------------------------

    /** Границы кольца по долготе и широте — грубый отсев до честной проверки. */
    function ringBox(ring) {
        const box = { w: HALF_TURN, e: -HALF_TURN, s: 90, n: -90 };
        ring.forEach(function (point) {
            if (point[0] < box.w) box.w = point[0];
            if (point[0] > box.e) box.e = point[0];
            if (point[1] < box.s) box.s = point[1];
            if (point[1] > box.n) box.n = point[1];
        });
        return box;
    }

    /** Разворачивает кольцо через линию перемены дат в пространство 0…360. */
    function unwrapRing(ring) {
        let w = HALF_TURN;
        let e = -HALF_TURN;
        let w2 = FULL_TURN;
        let e2 = 0;
        ring.forEach(function (point) {
            const lon = point[0];
            if (lon < w) w = lon;
            if (lon > e) e = lon;
            const shiftedLon = lon < 0 ? lon + FULL_TURN : lon;
            if (shiftedLon < w2) w2 = shiftedLon;
            if (shiftedLon > e2) e2 = shiftedLon;
        });

        const shifted = (e2 - w2) < (e - w) - UNWRAP_GAIN_DEG;
        if (!shifted) return { shifted: false, points: ring };

        return {
            shifted: true,
            points: ring.map(function (point) {
                return [point[0] < 0 ? point[0] + FULL_TURN : point[0], point[1]];
            }),
        };
    }

    /** Кольцо-замыкание вдоль самого полюса: в плоскости оно не замкнуто. */
    function isPolarRing(ring) {
        let minAbs = 90;
        let w = HALF_TURN;
        let e = -HALF_TURN;
        ring.forEach(function (point) {
            const abs = Math.abs(point[1]);
            if (abs < minAbs) minAbs = abs;
            if (point[0] < w) w = point[0];
            if (point[0] > e) e = point[0];
        });
        return minAbs > POLAR_LAT_DEG && (e - w) > POLAR_SPAN_DEG;
    }

    /** Проекция на плоскость вокруг полюса: широта — радиус, долгота — угол. */
    function projectPolar(lon, lat, south) {
        const radius = south ? 90 + lat : 90 - lat;
        return [radius * Math.cos(lon * DEG), radius * Math.sin(lon * DEG)];
    }

    /** Луч вправо, чётность пересечений. Кольцо считается замкнутым. */
    function pointInRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0];
            const yi = ring[i][1];
            const xj = ring[j][0];
            const yj = ring[j][1];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    // --- Пространственный индекс --------------------------------------------

    function cellKey(lon, lat) {
        return Math.floor(lon / CELL_DEG) + ':' + Math.floor(lat / CELL_DEG);
    }

    /** Описание одного полигона в виде, пригодном для быстрой проверки. */
    function makeRef(index, poly) {
        const polarIdx = findPolarRing(poly);
        if (polarIdx >= 0) {
            const coast = poly[polarIdx === 0 ? Math.min(1, poly.length - 1) : 0];
            const south = coast[0][1] < 0;
            return {
                index: index,
                polar: true,
                south: south,
                ring: coast.map(function (point) {
                    return projectPolar(point[0], point[1], south);
                }),
                box: {
                    w: -HALF_TURN, e: HALF_TURN,
                    s: south ? -90 : POLAR_GUARD_LAT,
                    n: south ? -POLAR_GUARD_LAT : 90,
                },
            };
        }

        const unwrapped = unwrapRing(poly[0]);
        return {
            index: index,
            polar: false,
            shifted: unwrapped.shifted,
            outer: unwrapped.points,
            holes: poly.slice(1).map(function (hole) {
                return unwrapRing(hole).points;
            }),
            box: ringBox(unwrapped.points),
        };
    }

    function findPolarRing(poly) {
        for (let i = 0; i < poly.length; i++) {
            if (isPolarRing(poly[i])) return i;
        }
        return -1;
    }

    /** Раскладывает полигон по всем ячейкам, которые накрывает его рамка. */
    function addToIndex(cells, ref) {
        const startLon = Math.floor(ref.box.w / CELL_DEG) * CELL_DEG;
        const startLat = Math.floor(ref.box.s / CELL_DEG) * CELL_DEG;
        for (let lon = startLon; lon <= ref.box.e; lon += CELL_DEG) {
            for (let lat = startLat; lat <= ref.box.n; lat += CELL_DEG) {
                // Развёрнутый полигон живёт в 0…360, а спрашивают его
                // в обычных долготах — ячейку заводим по обычной.
                const key = cellKey(
                    (ref.shifted && lon >= HALF_TURN ? lon - FULL_TURN : lon) + CELL_NUDGE,
                    lat + CELL_NUDGE);
                if (!cells.has(key)) cells.set(key, []);
                cells.get(key).push(ref);
            }
        }
    }

    function hitsRef(ref, lat, lng) {
        if (ref.polar) {
            if (ref.south ? lat > -POLAR_GUARD_LAT : lat < POLAR_GUARD_LAT) return false;
            const flat = projectPolar(lng, lat, ref.south);
            return pointInRing(flat[0], flat[1], ref.ring);
        }

        const lon = ref.shifted && lng < 0 ? lng + FULL_TURN : lng;
        const box = ref.box;
        if (lon < box.w || lon > box.e || lat < box.s || lat > box.n) return false;
        if (!pointInRing(lon, lat, ref.outer)) return false;
        return !ref.holes.some(function (hole) {
            return pointInRing(lon, lat, hole);
        });
    }

    /** Долгота в промежуток -180…180: сцена умеет отдать и 180.0001. */
    function normalizeLng(lng) {
        return ((lng % FULL_TURN) + FULL_TURN + HALF_TURN) % FULL_TURN - HALF_TURN;
    }

    /**
     * Кольца для линий границ: полярное замыкание туда не идёт.
     * Отрезок вдоль параллели -90° рисуется точкой в полюсе и читается как
     * сбой отрисовки, а не как граница.
     */
    function drawableRings(poly) {
        const rings = poly.filter(function (ring) {
            return !isPolarRing(ring);
        });
        return rings.length ? rings : poly;
    }

    // --- Сборка --------------------------------------------------------------

    /**
     * Готовит контуры к работе.
     *
     * @param {Array} countries список из NF.api.listCountries
     * @returns {{rings: Array, shapeOf: Function, countryAt: Function, polygons: number}}
     */
    function build(countries) {
        const list = Array.isArray(countries) ? countries : [];
        const rings = [];
        const shapes = [];
        const cells = new Map();
        let polygons = 0;

        list.forEach(function (country, index) {
            const polys = polygonsOf(country && country.outline);
            const shape = [];
            polys.forEach(function (poly) {
                const drawable = drawableRings(poly);
                drawable.forEach(function (ring) { rings.push(ring); });
                shape.push(drawable);
                addToIndex(cells, makeRef(index, poly));
                polygons++;
            });
            shapes.push(shape.length ? shape : null);
        });

        return {
            /** Плоский список колец — одна геометрия на все границы мира. */
            rings: rings,

            /** Координаты MultiPolygon страны или null, если контура нет. */
            shapeOf: function (index) {
                return shapes[index] || null;
            },

            /** Индекс страны под точкой или -1, если это вода. */
            countryAt: function (lat, lng) {
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return -1;
                const lon = normalizeLng(lng);
                const bucket = cells.get(cellKey(lon, lat));
                if (!bucket) return -1;
                for (let i = 0; i < bucket.length; i++) {
                    if (hitsRef(bucket[i], lat, lon)) return bucket[i].index;
                }
                return -1;
            },

            /** Сколько полигонов разобрано — для отчёта о данных, не для логики. */
            polygons: polygons,
        };
    }

    return {
        build: build,
        polygonsOf: polygonsOf,
        isPolarRing: isPolarRing,
    };
})();
