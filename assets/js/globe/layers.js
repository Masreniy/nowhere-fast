/**
 * Слои на планете: границы, поднятая страна, дуга перелёта, кольца и города.
 *
 * Основа — three-globe (тот же движок, что под globe.gl): от него полигоны
 * с анимацией высоты, дуги, кольца и объекты на поверхности.
 *
 * Два решения, которые выглядят странно, пока не знаешь причину:
 *
 *   1. Границы всех стран — ОДИН THREE.LineSegments на общей геометрии,
 *      а не слой pathsData. Слой делал из этого 566 отдельных объектов,
 *      то есть 566 вызовов отрисовки каждый кадр, и подтекал примерно
 *      430 буферами на каждый выбор страны.
 *   2. Города — слой objectsData со сферами, а не pointsData. Точки слоя
 *      рисуются цилиндрами от поверхности, и над поднятой страной это были
 *      чёрные иглы длиной в полтысячи километров.
 */
window.NF = window.NF || {};

NF.globeLayers = (function () {
    'use strict';

    /** Линии границ чуть над поверхностью, иначе они тонут в текстуре. */
    const BORDER_LIFT = 1.002;
    const BORDER_RESOLUTION = 1.5;
    const BORDER_COLOR = 0xc6d8ec;
    const BORDER_OPACITY = 0.42;

    /** Метка города: маленькая сфера тёплого цвета. */
    const CITY_MARKER_RADIUS = 0.5;
    const CITY_MARKER_COLOR = 0xffd79a;

    const ATMOSPHERE_COLOR = '#78b4ff';
    const ATMOSPHERE_ALTITUDE = 0.24;
    /**
     * Дробление сферы планеты. Тройка, а не 1,5: на полутора у края шара
     * видны грани, и терминатор идёт ступеньками.
     */
    const CURVATURE_RESOLUTION = 3;
    const CAP_CURVATURE_RESOLUTION = 2;

    const POLYGON_STROKE = 'rgba(255, 210, 150, 0.9)';
    const POLYGON_BASE_ALTITUDE = 0.004;
    const POLYGON_TRANSITION_MS = 900;

    const ARC_COLORS = ['rgba(255, 186, 110, 0.0)', 'rgba(255, 214, 150, 0.95)'];
    const ARC_STROKE = 0.5;
    const ARC_ALTITUDE_SCALE = 0.4;
    const ARC_CURVE_RESOLUTION = 96;
    const ARC_CIRCULAR_RESOLUTION = 8;
    /** Промежуток длиннее штриха — по дуге бежит комета, а не лежит лента. */
    const ARC_DASH_LENGTH = 0.35;
    const ARC_DASH_GAP = 0.9;
    const ARC_DASH_MS = 2200;

    const RING_RESOLUTION = 96;
    const RING_MAX_RADIUS = 2.6;
    const RING_SPEED = 2.2;
    const RING_PERIOD_MS = 1400;
    const RING_OPACITY = 0.85;
    const RING_FADE_POWER = 1.6;

    /** Свет для слоёв three-globe. Наши собственные шейдеры его игнорируют. */
    const AMBIENT_COLOR = 0xcbd8ff;
    const AMBIENT_POWER = 0.4;
    const SUN_LIGHT_COLOR = 0xfff0d4;
    const SUN_LIGHT_POWER = 0.95;
    const SUN_LIGHT_DISTANCE = 1000;

    function ringColor() {
        return function (t) {
            return 'rgba(255, 205, 140, '
                + (RING_OPACITY * Math.pow(1 - t, RING_FADE_POWER)).toFixed(3) + ')';
        };
    }

    /** Границы мира одной геометрией: все кольца всех стран разом. */
    function buildBorders(rings, radius) {
        const THREE = NF.three;
        const geometry = new NF.GeoJsonGeometry(
            { type: 'MultiLineString', coordinates: rings },
            radius * BORDER_LIFT, BORDER_RESOLUTION);
        const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
            color: BORDER_COLOR,
            transparent: true,
            opacity: BORDER_OPACITY,
            depthWrite: false,
        }));
        lines.renderOrder = 1;
        return lines;
    }

    function buildGlobe(options, marker, liftAltitude) {
        const globe = new NF.ThreeGlobe({ animateIn: false })
            .globeMaterial(options.earthMaterial)
            .showAtmosphere(true)
            .atmosphereColor(ATMOSPHERE_COLOR)
            .atmosphereAltitude(ATMOSPHERE_ALTITUDE)
            .globeCurvatureResolution(CURVATURE_RESOLUTION)
            .polygonCapMaterial(options.capMaterial)
            .polygonSideMaterial(options.sideMaterial)
            .polygonStrokeColor(function () { return POLYGON_STROKE; })
            .polygonAltitude(liftAltitude)
            .polygonCapCurvatureResolution(CAP_CURVATURE_RESOLUTION)
            .polygonsTransitionDuration(POLYGON_TRANSITION_MS)
            .polygonsData([]);

        return globe
            .arcColor(function () { return ARC_COLORS; })
            .arcStroke(ARC_STROKE)
            .arcAltitudeAutoScale(ARC_ALTITUDE_SCALE)
            .arcCurveResolution(ARC_CURVE_RESOLUTION)
            .arcCircularResolution(ARC_CIRCULAR_RESOLUTION)
            .arcDashLength(ARC_DASH_LENGTH)
            .arcDashGap(ARC_DASH_GAP)
            .arcDashAnimateTime(ARC_DASH_MS)
            .arcsTransitionDuration(0)
            .arcEndAltitude(function (d) { return d.endAlt; })
            .arcsData([])
            .ringColor(ringColor)
            .ringResolution(RING_RESOLUTION)
            .ringMaxRadius(RING_MAX_RADIUS)
            .ringPropagationSpeed(RING_SPEED)
            .ringRepeatPeriod(RING_PERIOD_MS)
            .ringAltitude(function (d) { return d.alt; })
            .ringsData([])
            .objectLat('lat')
            .objectLng('lng')
            .objectAltitude(function (d) { return d.alt; })
            .objectFacesSurface(false)
            .objectThreeObject(function () { return marker.clone(); })
            .objectsData([]);
    }

    /**
     * Собирает слои планеты.
     *
     * @param {Object} options { earthMaterial, capMaterial, sideMaterial,
     *                           rings, radius, liftAltitude }
     *        liftAltitude — функция, которая отдаёт текущую высоту подъёма:
     *        полигон входит прижатым к поверхности и поднимается переходом.
     */
    function create(options) {
        const THREE = NF.three;
        const radius = options.radius;

        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(CITY_MARKER_RADIUS, 16, 12),
            new THREE.MeshBasicMaterial({ color: CITY_MARKER_COLOR })
        );

        const borders = buildBorders(options.rings, radius);
        const globe = buildGlobe(options, marker, options.liftAltitude);

        // Без этого не идут переходы самого three-globe: высота полигона,
        // бегущий пунктир дуги, пульсация колец. Именно поэтому страна
        // «поднималась» на нулевую высоту.
        globe.resumeAnimation();

        // Слои three-globe собраны на материалах, которым нужен свет: без него
        // маркеры городов чёрные. Наши шейдеры планеты свет игнорируют.
        const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_POWER * Math.PI);
        const sunLight = new THREE.DirectionalLight(SUN_LIGHT_COLOR, SUN_LIGHT_POWER * Math.PI);

        return {
            globe: globe,
            borders: borders,
            sunLight: sunLight,
            objects: [globe, borders, ambient, sunLight],

            /** Свет идёт оттуда же, где Солнце: слои и планета освещены согласно. */
            setSun: function (direction) {
                sunLight.position.copy(direction).multiplyScalar(SUN_LIGHT_DISTANCE);
            },

            /** Поднять страну. Контур приходит из NF.globeOutlines.shapeOf. */
            showCountry: function (index, shape) {
                if (!shape || !shape.length) {
                    globe.polygonsData([]);
                    return;
                }
                globe.polygonsData([{
                    country: index,
                    geometry: { type: 'MultiPolygon', coordinates: shape },
                }]);
            },

            /** Кольца: точка отсчёта и выбранное место. */
            setMarks: function (marks) {
                globe.ringsData(marks);
            },

            /** Метки городов выбранной страны. */
            setCities: function (points) {
                globe.objectsData(points);
            },

            /** Дуга перелёта от точки отсчёта к выбранному месту. */
            setArc: function (arc) {
                globe.arcsData(arc ? [arc] : []);
            },

            clear: function () {
                globe.polygonsData([]).arcsData([]).objectsData([]);
            },

            /**
             * В режиме неба сам шар не нужен: его заменяет земля под ногами.
             * Сетка госграниц, уходящая к горизонту из-под ног, читается как
             * сбой отрисовки, а не как земля.
             */
            setVisible: function (visible) {
                globe.visible = visible;
                borders.visible = visible;
            },

            /** Ответ библиотеки о точке на поверхности — им сверяется наше соглашение. */
            libraryCoords: function (lat, lng, alt) {
                return globe.getCoords(lat, lng, alt);
            },

            dispose: function () {
                globe.pauseAnimation();
                borders.geometry.dispose();
                borders.material.dispose();
                marker.geometry.dispose();
                marker.material.dispose();
            },
        };
    }

    return { create: create };
})();
