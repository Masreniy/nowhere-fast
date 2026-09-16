/**
 * Астрономия глобуса: где на самом деле находятся Солнце и Луна.
 *
 * Зачем модуль существует. Терминатор дня и ночи, положение Луны и поворот
 * звёздного неба — это единственное на странице, что нельзя нарисовать
 * «примерно»: человек смотрит на свой город и сверяет с окном. Поэтому здесь
 * настоящие формулы, а не подгонка под красивую картинку.
 *
 * Формулы низкой точности — из «Astronomical Almanac» и работ Пола Шлютера.
 * Точность проверена сверкой с пакетом astronomy-engine (полная теория):
 * Солнце не хуже 0,0078°, Луна — 0,0781°, фаза — 0,18 %, звёздное время —
 * 0,0042° на сорока датах с 2020 по 2031 год. Опорные значения этой сверки
 * зашиты в tests/globe-astro.test.js, чтобы правка формулы не прошла молча.
 *
 * Модуль чистый: ни document, ни THREE, ни сети. «Сейчас» всегда подаётся
 * аргументом — иначе функцию, зависящую от текущего момента, нельзя проверить
 * тестом, а именно она и ломается через полгода.
 *
 * Расстояния по дуге большого круга здесь нет намеренно: оно живёт в
 * NF.origin.distanceKm и считается от точки отсчёта всего проекта.
 */
window.NF = window.NF || {};

NF.globeAstro = (function () {
    'use strict';

    const DEG = Math.PI / 180;

    /** Юлианская дата начала эпохи Unix и юлианская дата эпохи J2000.0. */
    const UNIX_EPOCH_JD = 2440587.5;
    const J2000_JD = 2451545.0;
    const MS_PER_DAY = 86400000;

    /**
     * Элементы лунной орбиты у Шлютера отсчитываются от эпохи 2000 Jan 0.0
     * (JD 2451543.5), а не от J2000 (JD 2451545.0). Полтора дня разницы —
     * это 19° по долготе Луны, ровно на них сверка и ловила промах.
     */
    const MOON_EPOCH_SHIFT_DAYS = 1.5;

    /** Сколько шагов Ньютона хватает уравнению Кеплера при e = 0,055. */
    const KEPLER_STEPS = 6;

    /** Приводит угол в градусах к промежутку 0…360. */
    function rev(x) {
        return x - Math.floor(x / 360) * 360;
    }

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    /** Юлианская дата момента. */
    function julianDay(date) {
        return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
    }

    /** Дней от эпохи J2000.0 — аргумент всех формул ниже. */
    function daysSinceJ2000(date) {
        return julianDay(date) - J2000_JD;
    }

    /**
     * Среднее гринвичское звёздное время в радианах.
     *
     * Это угол, на который Земля повернулась относительно точки весеннего
     * равноденствия. Им поворачивается небо: сама планета в сцене неподвижна,
     * потому что размещать города и страны в неподвижной системе надёжнее,
     * а для наблюдателя это одно и то же.
     */
    function gmst(date) {
        const d = daysSinceJ2000(date);
        return rev(280.46061837 + 360.98564736629 * d) * DEG;
    }

    /** Наклон эклиптики к экватору на эту дату, радианы. */
    function obliquity(d) {
        return (23.439 - 0.0000004 * d) * DEG;
    }

    /** Эклиптические координаты → экваториальные (всё в радианах). */
    function eclipticToEquatorial(lon, lat, tilt) {
        const sl = Math.sin(lon);
        const cl = Math.cos(lon);
        const sb = Math.sin(lat);
        const cb = Math.cos(lat);
        const se = Math.sin(tilt);
        const ce = Math.cos(tilt);
        const x = cb * cl;
        const y = cb * sl * ce - sb * se;
        const z = cb * sl * se + sb * ce;
        return { ra: Math.atan2(y, x), dec: Math.asin(clamp(z, -1, 1)) };
    }

    /**
     * Экваториальные координаты Солнца, радианы.
     * lambda — эклиптическая долгота, она же нужна для фазы Луны.
     */
    function sunPosition(date) {
        const d = daysSinceJ2000(date);
        const meanLon = rev(280.460 + 0.9856474 * d);
        const anomaly = rev(357.528 + 0.9856003 * d) * DEG;
        const lambda = (meanLon
            + 1.915 * Math.sin(anomaly)
            + 0.020 * Math.sin(2 * anomaly)) * DEG;
        const eq = eclipticToEquatorial(lambda, 0, obliquity(d));
        return { ra: eq.ra, dec: eq.dec, lambda: lambda };
    }

    /** Решает уравнение Кеплера: средняя аномалия → эксцентрическая. */
    function eccentricAnomaly(meanAnomaly, e) {
        let E = meanAnomaly + e * Math.sin(meanAnomaly) * (1 + e * Math.cos(meanAnomaly));
        for (let k = 0; k < KEPLER_STEPS; k++) {
            E -= (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
        }
        return E;
    }

    /**
     * Основные возмущения лунной долготы от Солнца.
     * Без них ошибка доходит до 1,5° — это два с половиной видимых диска Луны.
     */
    function moonLongitudePerturbations(M, D, Ms, F) {
        return (-1.274 * Math.sin(M - 2 * D)          // эвекция
            + 0.658 * Math.sin(2 * D)                 // вариация
            - 0.186 * Math.sin(Ms)                    // годичное уравнение
            - 0.059 * Math.sin(2 * M - 2 * D)
            - 0.057 * Math.sin(M - 2 * D + Ms)
            + 0.053 * Math.sin(M + 2 * D)
            + 0.046 * Math.sin(2 * D - Ms)
            + 0.041 * Math.sin(M - Ms)
            - 0.035 * Math.sin(D)                     // параллактическое неравенство
            - 0.031 * Math.sin(M + Ms)
            - 0.015 * Math.sin(2 * F - 2 * D)
            + 0.011 * Math.sin(M - 4 * D)) * DEG;
    }

    /** Возмущения лунной широты. */
    function moonLatitudePerturbations(M, D, F) {
        return (-0.173 * Math.sin(F - 2 * D)
            - 0.055 * Math.sin(M - F - 2 * D)
            - 0.046 * Math.sin(M + F - 2 * D)
            + 0.033 * Math.sin(F + 2 * D)
            + 0.017 * Math.sin(2 * M + F)) * DEG;
    }

    /** Положение Луны в плоскости эклиптики до поправок: долгота, широта, радиус. */
    function moonOrbit(dm) {
        const N = rev(125.1228 - 0.0529538083 * dm) * DEG;   // долгота узла
        const i = 5.1454 * DEG;                              // наклон орбиты
        const w = rev(318.0634 + 0.1643573223 * dm) * DEG;   // аргумент перигея
        const a = 60.2666;                                   // в радиусах Земли
        const e = 0.054900;
        const M = rev(115.3654 + 13.0649929509 * dm) * DEG;  // средняя аномалия

        const E = eccentricAnomaly(M, e);
        const xv = a * (Math.cos(E) - e);
        const yv = a * (Math.sqrt(1 - e * e) * Math.sin(E));
        const v = Math.atan2(yv, xv);
        const r = Math.hypot(xv, yv);

        const xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
        const yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
        const zh = r * (Math.sin(v + w) * Math.sin(i));

        return {
            lon: Math.atan2(yh, xh),
            lat: Math.atan2(zh, Math.hypot(xh, yh)),
            distance: r,
            N: N, w: w, M: M,
        };
    }

    /**
     * Экваториальные координаты Луны (радианы), расстояние в радиусах Земли
     * и доля освещённого диска.
     *
     * distance отдаётся наружу не для справки: Луна всего в 60 радиусах Земли,
     * и для наблюдателя на поверхности направление на неё отличается от
     * геоцентрического почти на градус. Параллакс учитывает сцена.
     */
    function moonPosition(date) {
        const d = daysSinceJ2000(date);
        const orbit = moonOrbit(d + MOON_EPOCH_SHIFT_DAYS);

        const Ls = rev(280.460 + 0.9856474 * d) * DEG;
        const Ms = rev(357.528 + 0.9856003 * d) * DEG;
        const Lm = orbit.N + orbit.w + orbit.M;
        const D = Lm - Ls;              // элонгация
        const F = Lm - orbit.N;         // аргумент широты

        const lon = orbit.lon + moonLongitudePerturbations(orbit.M, D, Ms, F);
        const lat = orbit.lat + moonLatitudePerturbations(orbit.M, D, F);
        const eq = eclipticToEquatorial(lon, lat, obliquity(d));

        // Фаза — угол Солнце — Земля — Луна.
        const sun = sunPosition(date);
        const elongation = Math.acos(clamp(
            Math.cos(lat) * Math.cos(lon - sun.lambda), -1, 1));

        return {
            ra: eq.ra,
            dec: eq.dec,
            distance: orbit.distance,
            illuminated: (1 - Math.cos(elongation)) / 2,
            elongation: elongation,
        };
    }

    /**
     * Единичный вектор по экваториальным координатам в системе сцены:
     * Y — ось вращения Земли, X — точка весеннего равноденствия.
     * Возвращает массив, а не THREE.Vector3: модуль не знает про движок.
     */
    function equatorialToVector(ra, dec) {
        const cd = Math.cos(dec);
        return [cd * Math.cos(ra), Math.sin(dec), cd * Math.sin(ra)];
    }

    /**
     * Подсолнечная точка: широта и долгота, где Солнце сейчас в зените.
     * Отсюда берётся направление света для шейдера Земли — то есть
     * терминатор дня и ночи.
     */
    function subsolarPoint(date) {
        const sun = sunPosition(date);
        const lng = ((sun.ra - gmst(date)) / DEG + 540) % 360 - 180;
        return { lat: sun.dec / DEG, lng: lng };
    }

    return {
        julianDay: julianDay,
        daysSinceJ2000: daysSinceJ2000,
        gmst: gmst,
        sunPosition: sunPosition,
        moonPosition: moonPosition,
        equatorialToVector: equatorialToVector,
        subsolarPoint: subsolarPoint,
    };
})();
