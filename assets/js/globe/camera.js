/**
 * Камера глобуса: три режима, перелёты, кадрирование.
 *
 * Режима действительно три, и это разные способы смотреть, а не настройки:
 *
 *   орбита  — камера вокруг центра планеты, привычный глобус;
 *   фокус   — камера вокруг выбранной точки на поверхности, «над местом»;
 *   небо    — камера стоит в точке отсчёта и смотрит вверх.
 *
 * Здесь же живёт соглашение о координатах — потому что именно оно превращает
 * широту и долготу в точку зрения, и потому что ошибиться в нём можно ровно
 * один раз на весь проект.
 */
window.NF = window.NF || {};

NF.globeCamera = (function () {
    'use strict';

    /** Радиус глобуса у three-globe. Не наш выбор — константа библиотеки. */
    const R = 100;
    const DEG = Math.PI / 180;

    /** Поле зрения: в космосе узкое, с земли широкое, как у глаза. */
    const FOV_ORBIT = 32;
    const FOV_SKY = 62;
    const FOV_SKY_MIN = 28;
    const FOV_SKY_MAX = 88;

    /** Стартовый наклон обзора планеты. */
    const EL_HOME = 0.32;
    /** Камера южнее точки — север оказывается вверху. */
    const NORTH_UP = Math.PI;

    /** Запас дальней плоскости за звёздами. */
    const FAR_MARGIN = 2.2;
    /** Ближняя плоскость в режиме неба: 0,4 отсекала землю ближе 25 км. */
    const NEAR_SKY = 0.02;
    /** Высота глаз наблюдателя над поверхностью в единицах сцены. */
    const EYE_HEIGHT = 0.35;

    /** Ширина, с которой карточка места помещается сбоку, а не поверх. */
    const WIDE_PX = 1100;
    /** Какую долю кадра занимает планета: с панелью сбоку и без неё. */
    const FILL_WIDE = 1.5;
    const FILL_NARROW = 1.12;
    /** Сдвиги кадра: под карточку вправо и «планета сбоку» на заставке. */
    const PANEL_SHIFT = 0.13;
    const IDLE_SHIFT = 0.15;
    const IDLE_DROP = 0.2;

    /** Пределы наклона и приближения. */
    const EL_MAX = 1.45;
    const EL_MIN_FREE = -1.45;
    const EL_MIN_FOCUS = 0.16;
    const SKY_EL_MIN = -0.05;
    const SKY_EL_MAX = 1.45;
    const ZOOM_OUT_LIMIT = 1.6;
    const ZOOM_IN_LIMIT = 0.98;
    /** Запас над шапкой поднятой страны, единицы сцены. */
    const LIFT_CLEARANCE = 8;
    const MIN_FOCUS_HEIGHT = 8;

    /** Чувствительность ввода. */
    const DRAG_K = 0.0040;
    const DRAG_NEAR = 260;
    const DRAG_FLOOR = 0.25;
    const SKY_DRAG_K = 0.0030;
    const WHEEL_K = 0.0011;
    const WHEEL_FOV_K = 0.02;

    /** Затухание инерции и возврат к самовращению. */
    const INERTIA = 0.92;
    const INERTIA_STOP = 1e-5;
    const IDLE_MS = 4500;
    const AUTO_SPEED = 0.03;
    const DIST_EASE = 5;

    /** Подъём страны: доля углового размаха и его границы. */
    const LIFT_PER_SPREAD = 0.0045;
    const LIFT_MIN = 0.004;
    const LIFT_MAX = 0.14;
    const SPREAD_FLOOR = 0.6;
    /** Сколько места вокруг страны остаётся в кадре при перелёте. */
    const FRAME_FILL = 0.52;
    const SPREAD_MIN_DEG = 0.35;

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    /**
     * Направление на точку (широта, долгота) — строго в системе three-globe.
     *
     * Сверено измерением с globeObj.getCoords: своя формула расходилась
     * с библиотечной ровно на 90° по долготе, и от этого промахивались клик,
     * подписи и положение Солнца относительно освещённой стороны. По Москве
     * промах доходил до 5205 км. Другого соглашения в проекте нет.
     */
    function coords(lat, lng, radius) {
        const r = radius === undefined ? 1 : radius;
        const la = lat * DEG;
        const lo = lng * DEG;
        return new NF.three.Vector3(
            r * Math.cos(la) * Math.sin(lo),
            r * Math.sin(la),
            r * Math.cos(la) * Math.cos(lo)
        );
    }

    /** Обратное преобразование: точка сцены → широта и долгота. */
    function vecToLatLng(vec) {
        const n = vec.clone().normalize();
        return {
            lat: Math.asin(clamp(n.y, -1, 1)) / DEG,
            lng: Math.atan2(n.x, n.z) / DEG,
        };
    }

    /** Плавность перелёта: разгон и торможение, без рывка на концах. */
    function easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Высота подъёма страны соразмерна самой стране, а не константе.
     *
     * Прежний пол 0.035 — это 223 км над поверхностью: для острова шириной
     * 50 км получалась не «всплывшая земля», а консервная банка с плоской
     * крышкой. Теперь подъём примерно в треть размаха страны, с потолком —
     * чтобы Россия не улетала от планеты.
     */
    function liftAltitudeFor(spread) {
        const angular = Math.max(SPREAD_FLOOR, spread || 0);
        return clamp(angular * LIFT_PER_SPREAD, LIFT_MIN, LIFT_MAX);
    }

    /**
     * Создаёт управление камерой поверх общего состояния сцены.
     *
     * @param {Object} camera PerspectiveCamera
     * @param {Object} state общее состояние сцены (az, el, dist, focus, mode…)
     */
    function create(camera, state) {
        const THREE = NF.three;
        const viewport = { w: 1, h: 1 };

        // Репер точки на поверхности. В кадре он нужен дважды с одним и тем же
        // аргументом, а зависит только от координат — считаем при смене точки.
        const frameCache = { lat: NaN, lng: NaN, value: null };

        function localFrame(lat, lng) {
            if (frameCache.lat === lat && frameCache.lng === lng) return frameCache.value;
            const anchor = coords(lat, lng, R);
            const up = anchor.clone().normalize();
            const north = coords(lat + 0.05, lng, R).sub(anchor).normalize();
            const east = coords(lat, lng + 0.05, R).sub(anchor).normalize();
            frameCache.lat = lat;
            frameCache.lng = lng;
            frameCache.value = { anchor: anchor, up: up, north: north, east: east };
            return frameCache.value;
        }

        function farPlane() {
            return NF.globeSky.STAR_RADIUS * FAR_MARGIN;
        }

        /**
         * Ближе этого камера не подойдёт: над шапкой поднятой страны нужен
         * запас, иначе на максимальном приближении камера оказывается ПОД ней
         * и экран заливает серое пятно без горизонта и без понимания, где ты.
         */
        function minDistance() {
            return R * (1 + Math.max(state.liftAlt, 0)) + LIFT_CLEARANCE;
        }

        /** С какого расстояния страна такого размаха помещается в кадр. */
        function distanceForSpread(spreadDeg) {
            const chord = 2 * R * Math.sin(Math.max(SPREAD_MIN_DEG, spreadDeg) * DEG);
            const half = Math.tan((FOV_ORBIT / 2) * DEG);
            const shrink = Math.min(1, camera.aspect);
            // Верхний предел — не state.fit: у России и США расчёт упирался
            // в него, и «перелёт» разворачивал кадр, никуда не приближаясь.
            // Обзор всего шара нужен как потолок при выходе, а не при прилёте.
            return clamp(R + chord / (FRAME_FILL * 2 * half * shrink),
                minDistance(), state.fit * ZOOM_IN_LIMIT);
        }

        /** Пересчёт кадра под размер холста: пропорции, охват, сдвиг под карточку. */
        function applyViewport(w, h) {
            viewport.w = w;
            viewport.h = h;
            camera.aspect = w / h;

            const wide = w >= WIDE_PX;
            const half = Math.tan((FOV_ORBIT / 2) * DEG);
            const needed = R * 2 * (wide ? FILL_WIDE : FILL_NARROW);
            state.fit = Math.max(needed / (2 * half), needed / (2 * half * camera.aspect));

            if (state.mode === 'sky') {
                camera.clearViewOffset();
            } else if (state.focus && wide) {
                // Справа карточка места — сдвигаем кадр, чтобы выбранное
                // оказалось по центру свободной части экрана, а не под панелью.
                camera.setViewOffset(w, h, w * PANEL_SHIFT, 0, w, h);
            } else {
                camera.setViewOffset(w, h, wide ? -w * IDLE_SHIFT : 0,
                    wide ? 0 : h * IDLE_DROP, w, h);
            }
            camera.updateProjectionMatrix();
        }

        function reframe() {
            applyViewport(viewport.w, viewport.h);
        }

        function tweenTo(targetAz, targetEl, targetDist, duration) {
            let dAz = (targetAz - state.az) % (Math.PI * 2);
            if (dAz > Math.PI) dAz -= Math.PI * 2;
            if (dAz < -Math.PI) dAz += Math.PI * 2;
            state.tween = {
                fromAz: state.az, dAz: dAz,
                fromEl: state.el, dEl: targetEl - state.el,
                fromDist: state.dist, dDist: targetDist - state.dist,
                start: performance.now(), duration: duration,
            };
            state.distTarget = targetDist;
            state.velAz = 0;
            state.velEl = 0;
        }

        /** Переход к взгляду «над точкой»: углы пересчитываются в местный репер. */
        function focusOn(lat, lng) {
            const wasFocused = Boolean(state.focus);
            const frame = localFrame(lat, lng);
            const v = camera.position.clone().sub(frame.anchor);
            const h = Math.max(MIN_FOCUS_HEIGHT, v.length());
            const d = v.normalize();
            state.focus = { lat: lat, lng: lng };
            state.az = Math.atan2(d.dot(frame.east), d.dot(frame.north));
            state.el = Math.asin(clamp(d.dot(frame.up), -1, 1));
            state.dist = R + h;
            if (!wasFocused) reframe();
        }

        function unfocus() {
            if (!state.focus) return;
            state.focus = null;
            reframe();
            const p = camera.position;
            state.dist = Math.max(R * 1.45, p.length());
            state.distTarget = state.dist;
            state.az = Math.atan2(p.z, p.x);
            state.el = Math.asin(clamp(p.y / p.length(), -1, 1));
        }

        function flyTo(lat, lng, dist, pitch, duration) {
            focusOn(lat, lng);
            tweenTo(NORTH_UP, pitch, dist, duration);
        }

        /** Облёт к точке без фокуса: так возвращаются к точке отсчёта. */
        function lookAt(lat, lng, dist, duration) {
            unfocus();
            const p = coords(lat, lng);
            tweenTo(Math.atan2(p.z, p.x), Math.asin(clamp(p.y, -1, 1)), dist, duration);
        }

        /** Куда сейчас повёрнут кадр: 0 — север вверху, растёт по часовой. */
        function heading() {
            if (!state.focus) return 0;
            return ((NORTH_UP - state.az) * 180 / Math.PI + 540) % 360 - 180;
        }

        function elevationFloor() {
            return state.focus ? EL_MIN_FOCUS : EL_MIN_FREE;
        }

        /** Стартовый кадр: со стороны, освещённой Солнцем. */
        function home(direction) {
            state.az = Math.atan2(direction.z, direction.x) - 0.5;
            state.el = EL_HOME;
        }

        function setDistance(value) {
            state.distTarget = clamp(value, minDistance(), state.fit * ZOOM_OUT_LIMIT);
        }

        function zoomByWheel(deltaY) {
            if (state.mode === 'sky') {
                camera.fov = clamp(camera.fov + deltaY * WHEEL_FOV_K, FOV_SKY_MIN, FOV_SKY_MAX);
                camera.updateProjectionMatrix();
                return;
            }
            setDistance(state.distTarget * Math.exp(deltaY * WHEEL_K));
        }

        function zoomByPinch(factor) {
            setDistance(state.distTarget * factor);
        }

        /** Поворот мышью или пальцем. Ближе к планете — мельче шаг. */
        function dragBy(dx, dy) {
            if (state.mode === 'sky') {
                state.skyAz -= dx * SKY_DRAG_K;
                // Ниже горизонта смотреть почти не даём: снимок 10 км на пиксель
                // с этой высоты всё равно не читается.
                state.skyEl = clamp(state.skyEl + dy * SKY_DRAG_K, SKY_EL_MIN, SKY_EL_MAX);
                return;
            }
            const k = DRAG_K * Math.min(1, (state.dist - R) / DRAG_NEAR + DRAG_FLOOR);
            state.velAz = dx * k;
            state.velEl = dy * k;
            state.az += state.velAz;
            state.el = clamp(state.el + state.velEl, elevationFloor(), EL_MAX);
        }

        /** Поле зрения режима: в космосе узкое, с земли широкое. */
        function applyMode(mode) {
            camera.fov = mode === 'sky' ? FOV_SKY : FOV_ORBIT;
            reframe();
        }

        /** Куда смотреть в небе: на Солнце, а после заката — на Луну. */
        function aimSky(target) {
            if (!state.origin) return;
            const frame = localFrame(state.origin.lat, state.origin.lng);
            state.skyAz = Math.atan2(target.dot(frame.east), target.dot(frame.north));
            state.skyEl = Math.max(0.15, Math.asin(clamp(target.dot(frame.up), -1, 1)));
        }

        function stepTween(now) {
            const t = Math.min(1, (now - state.tween.start) / state.tween.duration);
            const e = easeInOut(t);
            state.az = state.tween.fromAz + state.tween.dAz * e;
            state.el = state.tween.fromEl + state.tween.dEl * e;
            state.dist = state.tween.fromDist + state.tween.dDist * e;
            if (t >= 1) {
                state.tween = null;
                state.idleAt = now;
            }
        }

        function stepInertia(now, dt, reduceMotion) {
            state.az += state.velAz;
            state.el = clamp(state.el + state.velEl, elevationFloor(), EL_MAX);
            state.velAz *= INERTIA;
            state.velEl *= INERTIA;
            if (Math.abs(state.velAz) < INERTIA_STOP) state.velAz = 0;
            if (Math.abs(state.velEl) < INERTIA_STOP) state.velEl = 0;
            if (!state.auto && now - state.idleAt > IDLE_MS) state.auto = true;

            const idleSpin = state.auto && !reduceMotion && !state.selected
                && state.mode === 'orbit' && !state.focus;
            if (idleSpin) state.az += dt * AUTO_SPEED;
            state.dist += (state.distTarget - state.dist) * Math.min(1, dt * DIST_EASE);
        }

        /** Шаг движения камеры: перелёт либо инерция и самовращение. */
        function step(now, dt, dragging, reduceMotion) {
            if (state.tween) {
                stepTween(now);
                return;
            }
            if (!dragging) stepInertia(now, dt, reduceMotion);
        }

        function placeSky() {
            const frame = localFrame(state.origin.lat, state.origin.lng);
            const cosEl = Math.cos(state.skyEl);
            const look = frame.north.clone().multiplyScalar(cosEl * Math.cos(state.skyAz))
                .addScaledVector(frame.east, cosEl * Math.sin(state.skyAz))
                .addScaledVector(frame.up, Math.sin(state.skyEl));
            camera.position.copy(frame.anchor).addScaledVector(frame.up, EYE_HEIGHT);
            camera.up.copy(frame.up);
            camera.lookAt(camera.position.clone().add(look));
            camera.near = NEAR_SKY;
            camera.far = farPlane();
            return frame;
        }

        function placeFocus() {
            const frame = localFrame(state.focus.lat, state.focus.lng);
            const h = Math.max(MIN_FOCUS_HEIGHT, state.dist - R);
            const cosEl = Math.cos(state.el);
            const dir = frame.up.clone().multiplyScalar(Math.sin(state.el))
                .addScaledVector(frame.north, cosEl * Math.cos(state.az))
                .addScaledVector(frame.east, cosEl * Math.sin(state.az))
                .normalize();
            camera.position.copy(frame.anchor).addScaledVector(dir, h);
            camera.up.copy(frame.up);
            camera.lookAt(frame.anchor);
            camera.near = Math.max(0.5, h * 0.04);
            camera.far = farPlane();
            return frame;
        }

        function placeOrbit() {
            const cosEl = Math.cos(state.el);
            camera.position.set(
                cosEl * Math.cos(state.az) * state.dist,
                Math.sin(state.el) * state.dist,
                cosEl * Math.sin(state.az) * state.dist
            );
            camera.up.set(0, 1, 0);
            camera.lookAt(0, 0, 0);
            camera.near = Math.max(1, state.dist - R * 1.5);
            camera.far = farPlane();
            return null;
        }

        /**
         * Ставит камеру по текущему режиму. Возвращает местный репер точки
         * отсчёта, когда смотрим с земли, — им сцена разворачивает землю
         * под ногами; в остальных режимах null.
         */
        function place() {
            let frame = null;
            if (state.mode === 'sky' && state.origin) frame = placeSky();
            else if (state.focus) frame = placeFocus();
            else frame = placeOrbit();
            camera.updateProjectionMatrix();
            return frame;
        }

        return {
            R: R,
            EL_HOME: EL_HOME,
            NORTH_UP: NORTH_UP,
            viewport: viewport,
            localFrame: localFrame,
            applyViewport: applyViewport,
            minDistance: minDistance,
            distanceForSpread: distanceForSpread,
            tweenTo: tweenTo,
            focusOn: focusOn,
            unfocus: unfocus,
            flyTo: flyTo,
            lookAt: lookAt,
            heading: heading,
            home: home,
            zoomByWheel: zoomByWheel,
            zoomByPinch: zoomByPinch,
            dragBy: dragBy,
            applyMode: applyMode,
            aimSky: aimSky,
            step: step,
            place: place,
        };
    }

    return {
        R: R,
        DEG: DEG,
        EL_HOME: EL_HOME,
        FOV_ORBIT: FOV_ORBIT,
        FOV_SKY: FOV_SKY,
        coords: coords,
        vecToLatLng: vecToLatLng,
        liftAltitudeFor: liftAltitudeFor,
        create: create,
    };
})();
