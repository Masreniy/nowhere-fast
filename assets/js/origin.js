/**
 * Точка отсчёта: откуда человек летит.
 *
 * Зачем этот файл существует. Расстояние, время перелёта, «сколько сейчас
 * времени там» и сама фраза «отсюда туда» — это свойства всего продукта,
 * а не украшение одной страницы. Пока точка отсчёта жила внутри страницы
 * глобуса, любая другая страница не могла сказать даже «до Гуанчжоу
 * семь тысяч километров».
 *
 * БЕЗОПАСНОСТЬ. Модуль не ходит в сеть — ни запросом, ни через слой данных.
 * Координаты человека остаются в его браузере: память страницы
 * плюс localStorage. Геолокация запрашивается ТОЛЬКО через штатный
 * navigator.geolocation.getCurrentPosition, то есть только после явного
 * разрешения в диалоге браузера, и с таймаутом — молча висящий запрос
 * выглядит как сломанная страница. Никуда эти координаты не отправляются.
 * Справочник городов подаётся снаружи (useGazetteer): origin.js не знает
 * ни про Supabase, ни про имена таблиц.
 *
 * Что здесь оценка, а не факт (и почему это подписано в самом ответе):
 *   - flightMinutes — крейсерская скорость плюс наземные минуты. Не расписание,
 *     не пересадки, не ветер. Возвращается объектом с пометкой assumed,
 *     как и всё выдуманное в NF.planner: число без объяснения в этом проекте
 *     запрещено.
 *   - localTime — солнечное время по долготе, а не настоящий часовой пояс.
 *     Базы поясов у нас нет; Китай целиком живёт по Пекину, и никакая
 *     долгота этого не знает.
 *
 * Отдельная выстраданная вещь — проверка часового пояса рамками региона.
 * Pacific/Chatham по голому имени города давал Чатем в графстве Кент
 * (51.4 N, 0.5 E) вместо островов Чатем (43.9 S, 176.5 W). Промах 19 000 км,
 * и от него потом считались ВСЕ расстояния на странице.
 */
window.NF = window.NF || {};

NF.origin = (function () {
    'use strict';

    /** Ключ в локальном хранилище. Точка отсчёта одна на весь проект. */
    const STORAGE_KEY = 'nf.origin';

    /** Откуда взялась точка. Человеку это показывают, поэтому значение закрытое. */
    const SOURCES = ['gps', 'zone', 'manual'];

    /** Радиус Земли, км. То же число, что в NF.planner.haversineKm. */
    const EARTH_RADIUS_KM = 6371;

    /** Сколько ждём ответа геолокации. Дольше — человек решит, что страница сломана. */
    const GEO_TIMEOUT_MS = 8000;

    /** Согласны на уже известное положение не старше десяти минут. */
    const GEO_MAX_AGE_MS = 600000;

    /** Запас к таймауту браузера: см. пояснение в detect(). */
    const GEO_GRACE_MS = 1000;

    /** Радиус, в котором город ещё можно назвать «где ты находишься». */
    const NEAR_CITY_KM = 400;

    /** Имя длиннее — это уже не имя места, а чей-то мусор в хранилище. */
    const MAX_NAME = 120;

    const MINUTES_IN_HOUR = 60;
    const HOUR_MS = 3600000;

    /** Градусов долготы на час солнечного времени. */
    const DEGREES_PER_HOUR = 15;

    /**
     * Допущение перелёта, вынесенное наружу нарочно.
     *
     * Это не расписание и не маршрут: прямая линия, крейсерская скорость
     * и фиксированная добавка на руление, взлёт и посадку. Пересадок,
     * ожидания в аэропорту и ветра здесь нет. Константа экспортируется,
     * чтобы интерфейс мог показать, из чего собрано число, а не выдавать
     * оценку за факт.
     */
    const FLIGHT = {
        cruiseKmh: 850,
        groundMinutes: 45,
    };

    /**
     * Грубые рамки регионов часовых поясов.
     *
     * Это проверка на нелепость, а не геометрия границ: она обязана отсечь
     * точку в Европе для пояса Pacific/*, и не обязана знать, где именно
     * кончается Тихий океан. Перенесено из прототипа globe/src/main.js
     * (константа ZONE_BOX) без изменения чисел.
     */
    const ZONE_BOX = {
        Pacific: function (lat, lng) { return Math.abs(lng) > 130; },
        Atlantic: function (lat, lng) { return lng < 20 && lng > -70; },
        Indian: function (lat, lng) { return lng > 20 && lng < 130; },
        Europe: function (lat, lng) { return lat > 34 && lng > -32 && lng < 70; },
        Africa: function (lat, lng) { return lat < 38 && lat > -37 && lng > -30 && lng < 55; },
        America: function (lat, lng) { return lng < -25 && lng > -175; },
        Asia: function (lat, lng) { return lng > 25 || lng < -170; },
        Australia: function (lat, lng) { return lat < 0 && lng > 110 && lng < 160; },
        Antarctica: function (lat) { return lat < -55; },
    };

    /** Справочник городов подаётся страницей через useGazetteer. */
    let gazetteer = [];

    /** Текущая точка и признак того, что хранилище уже прочитано. */
    let current = null;
    let loaded = false;

    let listeners = [];

    // --- Мелкие проверки ---------------------------------------------------

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    /**
     * Приводит аргумент «сейчас» к пригодному Date.
     *
     * Приём взят целиком из NF.dates.asDate — там он и объяснён: Date из
     * другого realm (окно jsdom в тесте, iframe в браузере) не проходит
     * instanceof, хотя это полноценная дата. Своя копия здесь потому,
     * что dates.js эту функцию наружу не отдаёт, а лезть в его внутренности
     * хуже, чем восемь строк с пометкой происхождения.
     */
    function asDate(value) {
        if (value === undefined || value === null) return new Date();
        if (Object.prototype.toString.call(value) !== '[object Date]') return null;
        if (isNaN(value.getTime())) return null;
        return value;
    }

    /**
     * Число из внешнего значения.
     *
     * Своя проверка нужна потому, что Number() слишком добрый: он превращает
     * null и пустую строку в ноль, а true в единицу. Для координат это опасно
     * ровно один раз — distanceKm(null, null) молча считал бы расстояние
     * до точки в Гвинейском заливе и выдавал бы его за ответ.
     */
    function num(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value !== 'string' || value.trim() === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function isLat(value) {
        return typeof value === 'number' && Number.isFinite(value) &&
            value >= -90 && value <= 90;
    }

    function isLng(value) {
        return typeof value === 'number' && Number.isFinite(value) &&
            value >= -180 && value <= 180;
    }

    /**
     * Проверяет точку и приводит её к каноническому виду.
     *
     * Данные приходят из localStorage, то есть от кого угодно: их мог
     * подложить другой скрипт, старая версия сайта или сам человек из консоли.
     * Всё, что не прошло проверку, — не точка: возвращаем null и работаем так,
     * будто точки нет. Молча, без исключений: страница не имеет права падать
     * из-за мусора в хранилище.
     */
    function readOrigin(raw, defaultSource) {
        if (!raw || typeof raw !== 'object') return null;

        const lat = raw.lat;
        const lng = raw.lng;
        if (!isLat(lat) || !isLng(lng)) return null;

        // Имя необязательно, но если оно есть — это строка. Число или объект
        // здесь означает, что запись собрал не этот код.
        if (raw.name !== undefined && raw.name !== null && typeof raw.name !== 'string') {
            return null;
        }
        const name = raw.name ? String(raw.name).trim().slice(0, MAX_NAME) : null;

        // Неизвестное происхождение считаем ручным: точка есть, а честно
        // сказать «это определил браузер» мы уже не можем.
        const source = SOURCES.indexOf(raw.source) === -1
            ? (defaultSource || 'manual') : raw.source;

        return { lat: lat, lng: lng, name: name || null, source: source };
    }

    // --- Хранилище ---------------------------------------------------------

    /**
     * Хранилище может быть недоступно: приватный режим, запрет сторонних
     * данных, открытие файла с диска. Это не ошибка приложения — работаем
     * без памяти между заходами, но работаем.
     */
    function loadStored() {
        let raw = null;
        try {
            raw = window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }
        if (!raw) return null;

        let saved;
        try {
            saved = JSON.parse(raw);
        } catch (error) {
            return null;
        }
        return readOrigin(saved, 'manual');
    }

    function store(origin) {
        try {
            if (origin) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(origin));
            else window.localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    // --- Подписки ----------------------------------------------------------

    function notify() {
        const point = current ? Object.assign({}, current) : null;
        listeners.slice().forEach(function (fn) {
            try {
                fn(point);
            } catch (error) {
                // Один сломанный подписчик не должен отменять остальных.
                console.error('Nowhere Fast: подписчик NF.origin упал', error);
            }
        });
    }

    function onChange(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () {
            listeners = listeners.filter(function (item) { return item !== fn; });
        };
    }

    // --- Точка отсчёта -----------------------------------------------------

    /** Текущая точка или null. Хранилище читается один раз, при первом спросе. */
    function get() {
        if (!loaded) {
            loaded = true;
            current = loadStored();
        }
        return current ? Object.assign({}, current) : null;
    }

    /** Общий путь записи: проверить, запомнить, сохранить, известить. */
    function apply(origin, defaultSource) {
        const point = readOrigin(origin, defaultSource);
        if (!point) return null;
        loaded = true;
        current = point;
        store(point);
        notify();
        return Object.assign({}, point);
    }

    /** Задать точку вручную. Мусор не принимается и ничего не меняет. */
    function set(origin) {
        return apply(origin, 'manual');
    }

    function clear() {
        loaded = true;
        current = null;
        store(null);
        notify();
    }

    // --- Справочник городов ------------------------------------------------

    /**
     * Справочник для поиска города по имени и для подписи GPS-координат.
     *
     * Приходит снаружи: страница грузит города через NF.api и отдаёт их сюда.
     * Сам модуль в базу не ходит и про таблицы не знает.
     */
    function useGazetteer(list) {
        gazetteer = [];
        if (!list || typeof list.length !== 'number') return 0;

        Array.prototype.forEach.call(list, function (item) {
            if (!item || typeof item.name !== 'string') return;
            const lat = num(item.lat);
            const lng = num(item.lng);
            if (!isLat(lat) || !isLng(lng)) return;
            gazetteer.push({
                name: item.name,
                key: item.name.toLowerCase(),
                lat: lat,
                lng: lng,
                population: Number(item.population) || 0,
            });
        });
        return gazetteer.length;
    }

    /**
     * Город по имени с проверкой рамками региона.
     *
     * Одинаковых названий на карте много, поэтому из подходящих берём самый
     * населённый: пояс называют по крупному городу, а не по деревне-тёзке.
     */
    function findCity(key, box) {
        let best = null;
        gazetteer.forEach(function (city) {
            if (city.key !== key) return;
            if (box && !box(city.lat, city.lng)) return;
            if (!best || city.population > best.population) best = city;
        });
        return best;
    }

    function nearestCityName(lat, lng) {
        let best = null;
        gazetteer.forEach(function (city) {
            const km = haversineKm(lat, lng, city.lat, city.lng);
            if (km > NEAR_CITY_KM) return;
            if (!best || km < best.km) best = { km: km, name: city.name };
        });
        return best ? best.name : null;
    }

    // --- Часовой пояс ------------------------------------------------------

    function resolvedZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        } catch (error) {
            // Пояс недоступен — это не повод отменять всё остальное.
            return '';
        }
    }

    /**
     * Точка по имени часового пояса: 'Europe/Moscow' → Москва.
     *
     * Совпадения по голому имени мало (см. шапку файла, история Pacific/Chatham),
     * поэтому найденный город обязан попасть в грубые рамки своего региона.
     * Не попал — точки нет: пусть страница предложит выбрать вручную.
     * Лучше ничего, чем уверенный промах на девятнадцать тысяч километров.
     */
    function fromTimeZone(zone) {
        const name = typeof zone === 'string' && zone ? zone : resolvedZone();
        const parts = String(name).split('/');
        if (parts.length < 2) return null;

        const key = parts[parts.length - 1].replace(/_/g, ' ').toLowerCase();
        const city = findCity(key, ZONE_BOX[parts[0]]);
        if (!city) return null;

        return { lat: city.lat, lng: city.lng, name: city.name, source: 'zone' };
    }

    // --- Определение -------------------------------------------------------

    /**
     * Определить точку отсчёта: пояс сразу, геолокация — когда разрешат.
     *
     * Промис разрешается всегда и всегда чем-то осмысленным: точкой или null.
     * null означает «спроси человека», и страница обязана это предложить.
     *
     * В прототипе тут был баг, который стоит помнить: приглашение выбрать точку
     * висело только в колбэке ошибки геолокации. Если navigator.geolocation
     * отсутствовал вовсе (старый браузер, file://, закрытый политикой доступ),
     * колбэк не вызывался никогда — и половина функциональности молча
     * выключалась. Поэтому отсутствие API здесь — обычная ветка, а не тишина.
     */
    function detect(options) {
        const opts = options || {};
        const stored = get();

        // Выбранное человеком вручную не отбираем: он знает, откуда летит,
        // лучше, чем пояс и чем вышка сотовой связи.
        if (stored && stored.source === 'manual') return Promise.resolve(stored);

        const zone = fromTimeZone(opts.timeZone);
        const fallback = zone ? apply(zone, 'zone') : stored;

        return new Promise(function (resolve) {
            const geo = window.navigator && window.navigator.geolocation;
            if (!geo || typeof geo.getCurrentPosition !== 'function') {
                resolve(fallback);
                return;
            }
            askGeolocation(geo, opts, fallback, resolve);
        });
    }

    /**
     * Спросить браузер о положении. Диалог разрешения показывает он сам —
     * координаты приходят только если человек согласился. Никуда дальше
     * этой функции они не уходят: ни в сеть, ни в NF.api.
     */
    function askGeolocation(geo, opts, fallback, resolve) {
        const timeout = Number.isFinite(opts.timeout) ? opts.timeout : GEO_TIMEOUT_MS;
        let settled = false;

        function settle(value) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(value);
        }

        // Свой таймер поверх чужого: опция timeout — это просьба к браузеру,
        // а обещание странице должно быть выполнено в любом случае.
        const timer = window.setTimeout(function () { settle(fallback); }, timeout + GEO_GRACE_MS);

        geo.getCurrentPosition(function (position) {
            settle(acceptPosition(position) || fallback);
        }, function (error) {
            console.warn('NF.origin: геолокация недоступна:', error && error.message);
            settle(fallback);
        }, { timeout: timeout, maximumAge: GEO_MAX_AGE_MS });
    }

    /** Ответ геолокации → точка. Пока ждали, человек мог выбрать точку сам. */
    function acceptPosition(position) {
        const manual = get();
        if (manual && manual.source === 'manual') return manual;

        const coords = position && position.coords;
        if (!coords) return null;

        const lat = num(coords.latitude);
        const lng = num(coords.longitude);
        if (!isLat(lat) || !isLng(lng)) return null;

        return apply({ lat: lat, lng: lng, name: nearestCityName(lat, lng), source: 'gps' }, 'gps');
    }

    // --- Расстояние, перелёт, местное время --------------------------------

    /**
     * Расстояние по дуге большого круга, км. Формула гаверсинуса.
     *
     * Осознанная копия: та же формула живёт в NF.planner.haversineKm, но
     * наружу оттуда не отдана, а origin.js подключается и без планировщика.
     * Проверена независимо на парах через линию перемены дат — совпадение
     * до километра (tests/origin.test.js). Третья копия в проекте означает,
     * что пора заводить общий помощник, а не копировать снова.
     */
    function haversineKm(aLat, aLng, bLat, bLng) {
        const rad = Math.PI / 180;
        const dLat = (bLat - aLat) * rad;
        const dLng = (bLng - aLng) * rad;
        const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aLat * rad) * Math.cos(bLat * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /** Расстояние от точки отсчёта. Точки нет или координаты негодные — null. */
    function distanceKm(lat, lng) {
        const from = get();
        if (!from) return null;

        const toLat = num(lat);
        const toLng = num(lng);
        if (!isLat(toLat) || !isLng(toLng)) return null;

        return haversineKm(from.lat, from.lng, toLat, toLng);
    }

    /**
     * Сколько лететь — ОЦЕНКА, и она подписана как оценка.
     *
     * Возвращается объект, а не голое число, нарочно: правило проекта —
     * любое вычисленное число надо уметь объяснить. Поле explain — готовая
     * фраза для интерфейса, cruiseKmh и groundMinutes — из чего собрано,
     * assumed — честный признак, что это выдумано расчётом, а не расписанием.
     */
    function flightMinutes(km) {
        const distance = num(km);
        if (distance === null || distance < 0) return null;

        return {
            minutes: Math.round(distance / FLIGHT.cruiseKmh * MINUTES_IN_HOUR +
                FLIGHT.groundMinutes),
            assumed: true,
            cruiseKmh: FLIGHT.cruiseKmh,
            groundMinutes: FLIGHT.groundMinutes,
            explain: 'оценка: ' + FLIGHT.cruiseKmh + ' км/ч по прямой плюс ' +
                FLIGHT.groundMinutes + ' мин на взлёт и посадку; ' +
                'пересадки и ожидание не учтены',
        };
    }

    /**
     * Местное время по долготе, строка ЧЧ:ММ. Тоже ПРИБЛИЖЕНИЕ.
     *
     * Настоящего часового пояса здесь нет: солнечное время сдвигается ровно
     * на час каждые пятнадцать градусов. Китай целиком живёт по Пекину,
     * Индия сдвинута на полчаса, летнее время бывает — долгота об этом
     * не знает. Показывать это значение можно только с подписью «солнечное».
     *
     * «Сейчас» подаётся аргументом — иначе функцию нельзя проверить тестом
     * (то же правило, что в NF.dates).
     */
    function localTime(lng, date) {
        const degrees = num(lng);
        if (!isLng(degrees)) return null;

        const moment = asDate(date);
        if (moment === null) return null;

        const shifted = new Date(moment.getTime() +
            Math.round(degrees / DEGREES_PER_HOUR) * HOUR_MS);
        return pad(shifted.getUTCHours()) + ':' + pad(shifted.getUTCMinutes());
    }

    return {
        get: get,
        set: set,
        clear: clear,
        detect: detect,
        onChange: onChange,
        distanceKm: distanceKm,
        flightMinutes: flightMinutes,
        localTime: localTime,
        useGazetteer: useGazetteer,
        fromTimeZone: fromTimeZone,
        FLIGHT: FLIGHT,
        NEAR_CITY_KM: NEAR_CITY_KM,
    };
})();
