/**
 * Сцена глобуса целиком: сборка слоёв, состояние, кадр, ввод.
 *
 * Своё здесь только то, чего нет у three-globe: свет дня и ночи по настоящему
 * Солнцу, звёздное небо, Луна и три режима камеры. Всё остальное разложено
 * по соседним модулям: астрономия — astro.js, контуры — outlines.js, шейдеры —
 * materials.js, небо — sky.js, камера — camera.js, слои — layers.js.
 *
 * Данные приходят готовыми, сцена в базу не ходит (это дело страницы):
 *   data.countries — NF.api.listCountries()
 *   data.cities    — NF.api.listGeoCities()
 *   data.stars     — NF.globeStars из assets/data/globe-stars.js
 *   data.textures  — { earth, surface }
 *
 * Если WebGL недоступен, create бросает исключение: страница ловит его
 * и показывает человеку текст, а не чёрный экран.
 */
window.NF = window.NF || {};

NF.globe = (function () {
    'use strict';

    const DEG = Math.PI / 180;

    /** Порог, ниже которого движение пальцем считается выбором, а не поворотом. */
    const CLICK_SLOP_PX = 12;

    /** Шаг ячейки в указателе городов, градусы. */
    const CITY_CELL_DEG = 3;
    /** Сколько меток городов показываем у страны и у выбранного города. */
    const CITY_LIMIT_COUNTRY = 8;
    const CITY_LIMIT_CITY = 5;
    /** Метки и кольца ставим чуть выше шапки, иначе они тонут в ней. */
    const MARK_LIFT = 0.002;
    const CITY_LIFT = 0.004;
    const SURFACE_LIFT = 0.012;
    const GROUND_LIFT = 0.01;

    /** Анизотропия выше четырёх на таких углах обзора неотличима. */
    const MAX_ANISOTROPY = 4;
    /** Ограничение плотности пикселей: выше двух это видеопамять впустую. */
    const MAX_DPR = 2;

    /** Окно счётчика кадров и потолок шага физики. */
    const FPS_WINDOW_MS = 1000;
    const MAX_STEP_S = 0.1;

    /** Высота Солнца, на которой небо считается дневным (радианы). */
    const DAY_LOW = -0.10;
    const DAY_SPAN = 0.22;
    /** Выдержка неба: днём короткая, к закату длинная. */
    const EXPOSURE_DAY = 0.45;
    const EXPOSURE_DUSK = 2.8;
    const EXPOSURE_LOW_DEG = -4;
    const EXPOSURE_SPAN_DEG = 16;

    const EARTH_RADIUS_KM = 6371;

    /** Перелёты: наклон камеры и длительность. */
    const FLY_MS = 1600;
    const FLY_PITCH_COUNTRY = 0.85;
    const FLY_PITCH_CITY = 0.72;
    const CITY_SPREAD_DEG = 6;
    const RETURN_MS = 1400;
    const NORTH_MS = 700;
    const ORIGIN_FIT = 0.7;

    const clamp = NF.geo.clamp;

    /**
     * Расстояние по дуге между двумя произвольными точками, км.
     *
     * NF.origin.distanceKm считает только от точки отсчёта, а здесь нужно
     * «какие города рядом вот с этим». Формула общая — NF.geo.
     */
    const kmBetween = NF.geo.haversineKm;

    /**
     * Указатель городов по ячейкам.
     *
     * Города приходят строками из базы, а сцене нужны числа и быстрый ответ
     * «кто рядом»: перебор девяти тысяч городов на каждое движение мыши
     * заметен, перебор одной ячейки — нет.
     */
    function indexCities(cities, codeToCountry) {
        const list = (cities || []).map(function (city, i) {
            return {
                index: i,
                id: city.id,
                name: city.name,
                lat: city.lat,
                lng: city.lng,
                pop: city.population || 0,
                country: codeToCountry.has(city.country_code)
                    ? codeToCountry.get(city.country_code) : -1,
            };
        });

        const cells = new Map();
        list.forEach(function (city) {
            const key = cellKey(city.lat, city.lng);
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(city);
        });
        return { list: list, cells: cells };
    }

    function cellKey(lat, lng) {
        return Math.floor(lat / CITY_CELL_DEG) + ':' + Math.floor(lng / CITY_CELL_DEG);
    }

    function byPopulation(a, b) {
        return b.pop - a.pop;
    }

    /**
     * Создаёт сцену на холсте.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {Object} data { countries, cities, stars, textures }
     */
    function create(canvas, data) {
        const THREE = NF.three;
        const countries = data.countries || [];

        // Сглаживание выключаем там, где экран и так плотный: при DPR 2
        // картинка уже суперсемплится, MSAA поверх почти не виден, зато буферы
        // кадра вчетверо толще — на телефоне это 40 МиБ видеопамяти и потеря
        // контекста.
        const dense = (window.devicePixelRatio || 1) >= MAX_DPR;
        const renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: !dense,
            alpha: false,
            powerPreference: 'high-performance',
        });
        renderer.setClearColor(0x03040a, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(NF.globeCamera.FOV_ORBIT, 1, 10, 9000);
        const R = NF.globeCamera.R;

        const earth = NF.globeMaterials.earthMaterial(data.textures);
        const lift = NF.globeMaterials.liftMaterials(data.textures, R);
        // 16× анизотропии стоят до шестнадцати отсчётов на каждую выборку
        // и на наших углах обзора неотличимы от 4×.
        const aniso = Math.min(MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
        earth.textures.earth.anisotropy = aniso;
        earth.textures.surface.anisotropy = aniso;

        const shapes = NF.globeOutlines.build(countries);
        const codeToCountry = new Map();
        countries.forEach(function (country, i) {
            if (country && country.code) codeToCountry.set(country.code, i);
        });
        const cities = indexCities(data.cities, codeToCountry);

        const state = {
            az: 0, el: NF.globeCamera.EL_HOME,
            velAz: 0, velEl: 0,
            dist: 530, distTarget: 530, fit: 530,
            auto: true, idleAt: 0,
            mode: 'orbit',
            focus: null,
            skyAz: 0, skyEl: 0.5,
            selected: null,
            hover: -1,
            liftAlt: 0,
            timeOffsetMs: 0,
            origin: null,
            tween: null,
            date: new Date(),
            sunLocal: new THREE.Vector3(1, 0, 0),
            moonLocal: new THREE.Vector3(0, 1, 0),
            moonPhase: 0,
            sunAlt: 0,
            constellations: false,
        };

        const view = NF.globeCamera.create(camera, state);
        const sky = NF.globeSky.create(data.stars);
        const layers = NF.globeLayers.create({
            earthMaterial: earth.material,
            capMaterial: lift.cap,
            sideMaterial: lift.side,
            rings: shapes.rings,
            radius: R,
            liftAltitude: function () { return state.liftAlt; },
        });

        layers.objects.forEach(function (node) { scene.add(node); });
        sky.objects.forEach(function (node) { scene.add(node); });

        const listeners = { select: [], hover: [] };

        function emit(type, payload) {
            listeners[type].forEach(function (fn) { fn(payload); });
        }

        function subscribe(type, fn) {
            listeners[type].push(fn);
            return function () {
                const i = listeners[type].indexOf(fn);
                if (i >= 0) listeners[type].splice(i, 1);
            };
        }

        /* --- выбор --------------------------------------------------------- */

        function originRing() {
            return {
                lat: state.origin.lat, lng: state.origin.lng,
                alt: 0.004, kind: 'origin',
            };
        }

        function cityPoints(countryIndex, alt, limit) {
            const out = [];
            cities.list.forEach(function (city) {
                if (city.country !== countryIndex) return;
                out.push({
                    index: city.index, alt: alt,
                    lat: city.lat, lng: city.lng, pop: city.pop,
                    id: city.id, name: city.name,
                });
            });
            return out.sort(byPopulation).slice(0, limit);
        }

        function countryOf(selection) {
            return selection.kind === 'country' ? selection.index : selection.country;
        }

        function applySelection(selection) {
            state.selected = selection;
            if (!selection) {
                state.liftAlt = 0;
                layers.clear();
                layers.setMarks(state.origin ? [originRing()] : []);
                emit('select', null);
                return;
            }

            const index = countryOf(selection);
            const country = countries[index];
            const alt = NF.globeCamera.liftAltitudeFor(country ? country.spread : 8);
            state.liftAlt = alt;

            layers.showCountry(index, shapes.shapeOf(index));

            const marks = [];
            if (state.origin) marks.push(originRing());
            marks.push({
                lat: selection.lat, lng: selection.lng,
                alt: alt + MARK_LIFT, kind: 'target',
            });
            layers.setMarks(marks);
            layers.setCities(cityPoints(index, alt + CITY_LIFT,
                selection.kind === 'country' ? CITY_LIMIT_COUNTRY : CITY_LIMIT_CITY));
            layers.setArc(state.origin ? {
                startLat: state.origin.lat, startLng: state.origin.lng,
                endLat: selection.lat, endLng: selection.lng,
                endAlt: alt,
            } : null);

            emit('select', selection);
        }

        /* --- астрономия ----------------------------------------------------- */

        const sunWorld = new THREE.Vector3();
        const moonWorld = new THREE.Vector3();

        function updateMoon(gmstAngle) {
            const moon = NF.globeAstro.moonPosition(state.date);
            const moonLng = ((moon.ra - gmstAngle) / DEG + 540) % 360 - 180;
            state.moonLocal.copy(NF.globeCamera.coords(moon.dec / DEG, moonLng));
            if (state.origin) {
                // Луна всего в 60 радиусах Земли: для наблюдателя на поверхности
                // направление отличается от геоцентрического почти на градус.
                state.moonLocal.multiplyScalar(moon.distance)
                    .sub(NF.globeCamera.coords(state.origin.lat, state.origin.lng))
                    .normalize();
            }
            state.moonPhase = moon.illuminated;
            return moon;
        }

        function updateAstronomy() {
            state.date = new Date(Date.now() + state.timeOffsetMs);
            const gmstAngle = NF.globeAstro.gmst(state.date);

            // Земля неподвижна, небо поворачивается на звёздное время.
            sky.setSidereal(gmstAngle);

            const sub = NF.globeAstro.subsolarPoint(state.date);
            state.sunLocal.copy(NF.globeCamera.coords(sub.lat, sub.lng));
            const moon = updateMoon(gmstAngle);
            sky.place(state.sunLocal, state.moonLocal, sunWorld, moonWorld);

            earth.uniforms.uSun.value.copy(state.sunLocal);
            earth.uniforms.uMoon.value.copy(state.moonLocal);
            earth.uniforms.uMoonLight.value = moon.illuminated;
            lift.uniforms.uSun.value.copy(state.sunLocal);
            lift.uniforms.uLiftUnits.value = Math.max(0.5, state.liftAlt * R);
            layers.setSun(state.sunLocal);

            if (state.origin) {
                const up = NF.globeCamera.coords(state.origin.lat, state.origin.lng);
                state.sunAlt = Math.asin(clamp(up.dot(state.sunLocal), -1, 1));
            }
        }

        /* --- размер и проекция ---------------------------------------------- */

        function resize() {
            const w = canvas.clientWidth || window.innerWidth;
            const h = canvas.clientHeight || window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            renderer.setPixelRatio(dpr);
            renderer.setSize(w, h, false);
            view.applyViewport(w, h);
            sky.setPixelRatio(dpr);
        }

        const projectVec = new THREE.Vector3();
        // Обе проекции зовутся десятками раз за кадр из подписей — временные
        // векторы держим общими, иначе это ~190 объектов в кадр на сборщик.
        const scratchA = new THREE.Vector3();
        const scratchB = new THREE.Vector3();

        function projectWorld(vec) {
            projectVec.copy(vec).project(camera);
            return {
                x: (projectVec.x * 0.5 + 0.5) * view.viewport.w,
                y: (-projectVec.y * 0.5 + 0.5) * view.viewport.h,
                z: projectVec.z,
            };
        }

        /** Подпись над поднятой страной должна стоять на её шапке, а не на шаре. */
        function surfaceAltitude(lat, lng) {
            if (!state.selected || state.liftAlt <= 0) return GROUND_LIFT;
            const owner = shapes.countryAt(lat, lng);
            return owner === countryOf(state.selected)
                ? state.liftAlt + SURFACE_LIFT : GROUND_LIFT;
        }

        function projectSurface(lat, lng) {
            const world = NF.globeCamera.coords(lat, lng,
                R * (1 + surfaceAltitude(lat, lng)));
            const toCam = scratchA.copy(camera.position).sub(world);
            const facing = scratchB.copy(world).normalize()
                .dot(toCam.normalize()) > 0.02;
            const point = projectWorld(world);
            point.visible = facing && point.z < 1;
            return point;
        }

        function projectPoint(vec) {
            const point = projectWorld(vec);
            const seg = scratchA.copy(vec).sub(camera.position);
            const t = clamp(-camera.position.dot(seg) / seg.lengthSq(), 0, 1);
            const closest = scratchB.copy(camera.position).addScaledVector(seg, t);
            point.visible = point.z < 1 && closest.length() > R * 1.02;
            return point;
        }

        /* --- выбор указателем ------------------------------------------------ */

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), R);
        const hitPoint = new THREE.Vector3();

        function pickLatLng(clientX, clientY) {
            const rect = canvas.getBoundingClientRect();
            pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.ray.intersectSphere(sphere, hitPoint);
            return hit ? NF.globeCamera.vecToLatLng(hit) : null;
        }

        function countryAtPoint(clientX, clientY) {
            const ll = pickLatLng(clientX, clientY);
            return ll ? shapes.countryAt(ll.lat, ll.lng) : -1;
        }

        /* --- ввод ------------------------------------------------------------- */

        const input = {
            dragging: false, moved: 0, lastX: 0, lastY: 0,
            hoverPending: null, pinchStart: 0, pointers: new Map(),
        };

        function bump() {
            state.idleAt = performance.now();
            state.auto = false;
        }

        function onPointerDown(e) {
            input.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            input.dragging = true;
            input.moved = 0;
            input.lastX = e.clientX;
            input.lastY = e.clientY;
            state.tween = null;
            canvas.setPointerCapture(e.pointerId);
            bump();
        }

        function handlePinch() {
            const points = Array.from(input.pointers.values());
            const d = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            if (input.pinchStart) view.zoomByPinch(input.pinchStart / d);
            input.pinchStart = d;
            bump();
        }

        function onPointerMove(e) {
            if (input.pointers.has(e.pointerId)) {
                input.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }
            if (input.pointers.size === 2) {
                handlePinch();
                return;
            }
            if (!input.dragging) {
                input.hoverPending = { x: e.clientX, y: e.clientY };
                return;
            }

            const dx = e.clientX - input.lastX;
            const dy = e.clientY - input.lastY;
            input.lastX = e.clientX;
            input.lastY = e.clientY;
            input.moved += Math.abs(dx) + Math.abs(dy);
            view.dragBy(dx, dy);
            bump();
        }

        function endDrag(e) {
            input.pointers.delete(e.pointerId);
            if (input.pointers.size < 2) input.pinchStart = 0;
            input.dragging = input.pointers.size > 0;
            state.idleAt = performance.now();
        }

        function onPointerUp(e) {
            const isClick = input.dragging && input.moved < CLICK_SLOP_PX
                && input.pointers.size === 1 && state.mode !== 'sky';
            if (isClick) {
                const country = countryAtPoint(e.clientX, e.clientY);
                if (country >= 0) api.selectCountry(country);
                else api.clear();
            }
            endDrag(e);
        }

        function onPointerLeave() {
            input.hoverPending = null;
            if (state.hover !== -1) {
                state.hover = -1;
                emit('hover', null);
            }
        }

        function onWheel(e) {
            e.preventDefault();
            view.zoomByWheel(e.deltaY);
            if (state.mode !== 'sky') bump();
        }

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', endDrag);
        canvas.addEventListener('pointerleave', onPointerLeave);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('resize', resize);

        resize();
        state.dist = state.fit;
        state.distTarget = state.fit;
        state.az = 0;

        /* --- кадр -------------------------------------------------------------- */

        const reduceMotion = Boolean(window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        const stats = { fps: 0 };
        const frameMarks = [];
        let prev = performance.now();
        let framedOnce = false;
        let rafId = 0;
        let alive = true;

        function measureFps(now) {
            // Считаем по скользящему окну реальных меток, а не по dt: dt срезан
            // клампом (нужным физике), и ниже 10 кадров в секунду счётчик
            // показывал ровно то, чего не было — 60 при реальных 1,3.
            frameMarks.push(now);
            while (frameMarks.length > 1 && now - frameMarks[0] > FPS_WINDOW_MS) {
                frameMarks.shift();
            }
            const span = now - frameMarks[0];
            if (frameMarks.length > 1 && span > 0) {
                stats.fps = (frameMarks.length - 1) * FPS_WINDOW_MS / span;
            }
        }

        function daylightNow() {
            if (state.mode !== 'sky') return 0;
            return clamp((state.sunAlt - DAY_LOW) / DAY_SPAN, 0, 1);
        }

        /** Днём выдержка короткая, к закату длинная — иначе закат проваливается. */
        function exposureNow() {
            const sunDeg = state.sunAlt / DEG;
            const k = clamp((sunDeg - EXPOSURE_LOW_DEG) / EXPOSURE_SPAN_DEG, 0, 1);
            return EXPOSURE_DUSK + (EXPOSURE_DAY - EXPOSURE_DUSK) * k * k;
        }

        function updateHover() {
            if (!input.hoverPending || input.dragging || state.mode === 'sky') return;
            const index = countryAtPoint(input.hoverPending.x, input.hoverPending.y);
            input.hoverPending = null;
            if (index === state.hover) return;
            state.hover = index;
            canvas.style.cursor = index >= 0 ? 'pointer' : 'grab';
            emit('hover', index >= 0 ? index : null);
        }

        function frameOnce(now) {
            const dt = Math.min((now - prev) / 1000, MAX_STEP_S);
            prev = now;
            measureFps(now);
            updateAstronomy();

            if (!framedOnce) {
                framedOnce = true;
                // Стартуем со стороны, освещённой Солнцем.
                const sub = NF.globeAstro.subsolarPoint(state.date);
                view.home(NF.globeCamera.coords(sub.lat, sub.lng));
            }

            view.step(now, dt, input.dragging, reduceMotion);
            const frame = view.place();
            earth.uniforms.uCam.value.copy(camera.position);

            const inSky = state.mode === 'sky';
            layers.setVisible(!inSky);
            sky.setMode(inSky);
            if (inSky && frame) sky.placeGround(camera.position, frame.up);
            sky.setDaylight(daylightNow(), exposureNow(), state.constellations);

            updateHover();
            renderer.render(scene, camera);
        }

        function loop(now) {
            if (!alive) return;
            frameOnce(now);
            rafId = requestAnimationFrame(loop);
        }
        rafId = requestAnimationFrame(loop);

        /* --- публичный интерфейс ------------------------------------------------ */

        const api = {
            stats: stats,
            state: state,

            get mode() { return state.mode; },
            // Считаем на месте, а не отдаём то, что посчитал последний кадр:
            // карточка перерисовывается по событию ползунка, то есть до кадра,
            // и показывала бы время на шаг назад.
            get date() { return new Date(Date.now() + state.timeOffsetMs); },
            get distance() { return state.dist; },
            get fit() { return state.fit; },
            get moonPhase() { return state.moonPhase; },
            get liftAlt() { return state.liftAlt; },
            get heading() { return view.heading(); },
            get sunAltitude() { return state.sunAlt; },
            get sunWorld() { return sunWorld; },
            get moonWorld() { return moonWorld; },

            setTimeOffset: function (ms) { state.timeOffsetMs = ms; },
            setConstellations: function (on) { state.constellations = Boolean(on); },

            setMode: function (mode) {
                if (mode === 'sky' && !state.origin) return false;
                state.mode = mode;
                if (mode === 'sky') {
                    // Смотрим на Солнце, а после заката — на Луну: иначе человек
                    // оказывается лицом в пустое небо и не понимает, куда идти.
                    view.aimSky(state.sunAlt > -0.1 ? state.sunLocal : state.moonLocal);
                }
                view.applyMode(mode);
                return true;
            },

            selectCountry: function (index, fly) {
                const country = countries[index];
                if (!country) return;
                applySelection({
                    kind: 'country', index: index,
                    lat: country.lat, lng: country.lng,
                });
                if (fly !== false) {
                    view.flyTo(country.lat, country.lng,
                        view.distanceForSpread(country.spread), FLY_PITCH_COUNTRY, FLY_MS);
                }
            },

            selectCity: function (index, fly) {
                const city = cities.list[index];
                if (!city) return;
                applySelection({
                    kind: 'city', index: index,
                    lat: city.lat, lng: city.lng, country: city.country,
                });
                if (fly !== false) {
                    view.flyTo(city.lat, city.lng,
                        view.distanceForSpread(CITY_SPREAD_DEG), FLY_PITCH_CITY, FLY_MS);
                }
            },

            clear: function () {
                applySelection(null);
                if (!state.focus) return;
                view.unfocus();
                // Возвращаем не текущий наклон, а стартовый: Esc посреди
                // перелёта сохранял случайный угол момента прерывания, и
                // планета оставалась висеть боком или вверх ногами.
                view.tweenTo(state.az, NF.globeCamera.EL_HOME, state.fit, RETURN_MS);
            },

            setOrigin: function (origin) {
                state.origin = origin || null;
                if (!state.origin) {
                    layers.setMarks([]);
                    return;
                }
                if (state.selected) applySelection(state.selected);
                else layers.setMarks([originRing()]);
            },

            lookAtOrigin: function () {
                if (!state.origin) return;
                view.lookAt(state.origin.lat, state.origin.lng,
                    state.fit * ORIGIN_FIT, RETURN_MS);
            },

            /** Развернуть кадр так, чтобы север смотрел вверх. */
            faceNorth: function () {
                if (!state.focus) return;
                view.tweenTo(NF.globeCamera.NORTH_UP, state.el, state.dist, NORTH_MS);
            },

            countryAt: function (lat, lng) {
                return shapes.countryAt(lat, lng);
            },

            cityAt: function (index) {
                return cities.list[index] || null;
            },

            citiesInCountry: function (countryIndex, limit) {
                return cityPoints(countryIndex, 0, limit || CITY_LIMIT_COUNTRY);
            },

            citiesNear: function (lat, lng, maxKm, limit) {
                const out = [];
                const span = Math.ceil((maxKm / 111) / CITY_CELL_DEG) + 1;
                for (let dLat = -span; dLat <= span; dLat++) {
                    for (let dLng = -span; dLng <= span; dLng++) {
                        const bucket = cities.cells.get(cellKey(
                            lat + dLat * CITY_CELL_DEG, lng + dLng * CITY_CELL_DEG));
                        if (bucket) collectNear(out, bucket, lat, lng, maxKm);
                    }
                }
                return out.sort(byPopulation).slice(0, limit);
            },

            projectSurface: projectSurface,
            projectPoint: projectPoint,

            skyDirection: function (raDeg, decDeg) {
                return sky.direction(raDeg, decDeg);
            },

            onSelect: function (fn) { return subscribe('select', fn); },
            onHover: function (fn) { return subscribe('hover', fn); },

            dispose: function () {
                alive = false;
                cancelAnimationFrame(rafId);
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerup', onPointerUp);
                canvas.removeEventListener('pointercancel', endDrag);
                canvas.removeEventListener('pointerleave', onPointerLeave);
                canvas.removeEventListener('wheel', onWheel);
                window.removeEventListener('resize', resize);
                layers.dispose();
                sky.dispose();
                earth.material.dispose();
                lift.cap.dispose();
                lift.side.dispose();
                renderer.dispose();
            },
        };

        return api;
    }

    /** Города ячейки, попавшие в круг: дальше их сортирует вызывающий. */
    function collectNear(out, bucket, lat, lng, maxKm) {
        bucket.forEach(function (city) {
            const km = kmBetween(lat, lng, city.lat, city.lng);
            if (km <= maxKm) out.push({ index: city.index, km: km, pop: city.pop });
        });
    }

    return { create: create };
})();
