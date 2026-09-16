/**
 * Проверка точки отсчёта.
 *
 * Здесь три класса ошибок, и каждый из них тихий — ни одна не падает
 * с исключением, все три просто дают неверные числа на экране.
 *
 * 1. Уверенный промах определения. Pacific/Chatham по голому имени города
 *    давал Чатем в графстве Кент вместо островов Чатем: 19 000 км мимо,
 *    и от этой точки потом считались все расстояния. Отдельный именованный
 *    тест ниже сторожит именно этот случай.
 * 2. Молчаливое выключение. В прототипе приглашение выбрать точку висело
 *    только в колбэке ошибки геолокации, поэтому при полном отсутствии
 *    navigator.geolocation человек не видел ничего.
 * 3. Утечка координат. Модуль обязан держать положение человека в браузере.
 *    Тест мокает fetch и XMLHttpRequest и убеждается, что их никто не трогал.
 *
 * Расстояния сверены независимо — сферической теоремой косинусов, другой
 * формулой, а не той же самой: числа приведены в самих тестах.
 *
 * Пояс браузера задан явно, до первого обращения к Date и Intl: иначе тест
 * определения по поясу зеленел бы или краснел в зависимости от машины.
 *
 * Запуск:  npm test
 */
process.env.TZ = 'Europe/Moscow';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets/js/origin.js'), 'utf8');

/**
 * Справочник, который в бою приходит из NF.api. Два Чатема здесь не для
 * красоты: на них и держится проверка рамками региона.
 */
const CITIES = [
    { name: 'Moscow', lat: 55.7558, lng: 37.6173, population: 12600000 },
    { name: 'London', lat: 51.5074, lng: -0.1278, population: 8900000 },
    { name: 'Chatham', lat: 51.3813, lng: 0.5169, population: 76000 },
    { name: 'Chatham', lat: -43.95, lng: -176.55, population: 600 },
    { name: 'Guangzhou', lat: 23.1291, lng: 113.2644, population: 15300000 },
];

/** Поднимает документ и загружает в него origin.js. */
function setup(options) {
    const opts = options || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only', url: 'https://example.com/globe.html',
    });
    const win = dom.window;

    if (opts.brokenStorage) {
        Object.defineProperty(win, 'localStorage', {
            configurable: true,
            get() { throw new Error('хранилище недоступно'); },
        });
    }
    if (opts.stored !== undefined) {
        win.localStorage.setItem('nf.origin', opts.stored);
    }
    if (opts.geolocation) {
        win.navigator.geolocation = opts.geolocation;
    }

    win.eval(SOURCE);
    if (opts.gazetteer !== false) win.NF.origin.useGazetteer(CITIES);
    return win;
}

/** Повторный заход на страницу: тот же браузер, тот же localStorage. */
function reload(win) {
    win.eval(SOURCE);
    win.NF.origin.useGazetteer(CITIES);
    return win.NF.origin;
}

/** Геолокация, которая сразу отдаёт координаты — как будто человек разрешил. */
function allowGeo(lat, lng) {
    return {
        getCurrentPosition(onOk) { onOk({ coords: { latitude: lat, longitude: lng } }); },
    };
}

// --- Хранение ----------------------------------------------------------------

test('точка отсчёта переживает перезагрузку страницы', () => {
    const win = setup();
    const saved = win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });

    assert.strictEqual(saved.source, 'manual', 'заданная руками точка так и подписана');
    assert.strictEqual(win.NF.origin.get().name, 'Москва');

    // Тот же браузер, новый заход: модуль обязан поднять точку из хранилища.
    const afterReload = reload(win);
    assert.strictEqual(afterReload.get().lat, 55.7558);
    assert.strictEqual(afterReload.get().name, 'Москва');
});

test('очистка убирает точку и из памяти, и из хранилища', () => {
    const win = setup();
    win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });
    win.NF.origin.clear();

    assert.strictEqual(win.NF.origin.get(), null);
    assert.strictEqual(win.localStorage.getItem('nf.origin'), null);
    assert.strictEqual(reload(win).get(), null, 'после перезагрузки точка не должна воскреснуть');
});

test('мусор в хранилище не принимается и не роняет модуль', () => {
    // Хранилище — это внешние данные: туда пишет кто угодно, включая старую
    // версию сайта и консоль браузера.
    const garbage = [
        'не json вовсе',
        '[]',
        'null',
        '{"lat":"север","lng":"юг"}',
        '{"lat":999,"lng":37}',
        '{"lat":55,"lng":181}',
        '{"lat":null,"lng":null}',
        '{"lng":37}',
        '{"lat":55,"lng":37,"name":{"зло":1}}',
    ];
    garbage.forEach(function (raw) {
        const win = setup({ stored: raw });
        assert.strictEqual(win.NF.origin.get(), null, 'принят мусор: ' + raw);
        assert.strictEqual(win.NF.origin.distanceKm(23.1291, 113.2644), null);
    });
});

test('негодная точка в set ничего не меняет', () => {
    const win = setup();
    win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });

    assert.strictEqual(win.NF.origin.set({ lat: 91, lng: 0 }), null);
    assert.strictEqual(win.NF.origin.set({ lat: '55', lng: '37' }), null);
    assert.strictEqual(win.NF.origin.get().name, 'Москва', 'прежняя точка должна уцелеть');
});

test('недоступное хранилище не роняет модуль', () => {
    const win = setup({ brokenStorage: true });

    assert.strictEqual(win.NF.origin.get(), null);
    const saved = win.NF.origin.set({ lat: 51.5074, lng: -0.1278, name: 'Лондон' });
    assert.strictEqual(saved.name, 'Лондон', 'без хранилища точка живёт хотя бы в памяти');
    assert.ok(win.NF.origin.distanceKm(55.7558, 37.6173) > 0);
    win.NF.origin.clear();
    assert.strictEqual(win.NF.origin.get(), null);
});

// --- Часовой пояс ------------------------------------------------------------

test('Pacific/Chatham не даёт точку в Англии', () => {
    const win = setup();
    const point = win.NF.origin.fromTimeZone('Pacific/Chatham');

    // Острова Чатем: 43.95 S, 176.55 W. Чатем в графстве Кент: 51.38 N, 0.52 E.
    // Между ними 19 160 км — именно столько стоила ошибка прототипа.
    assert.ok(point, 'город пояса должен найтись');
    assert.ok(point.lat < 0, 'широта должна быть южной, а не английской');
    assert.ok(point.lng < -130, 'долгота должна быть тихоокеанской, а не гринвичской');
    assert.strictEqual(point.source, 'zone');
});

test('если в рамки региона не попал никто — точки нет, а не есть неверная', () => {
    const win = setup();
    // В справочнике остался только английский Чатем: тихоокеанский пояс
    // обязан отказаться, а не взять того, кто нашёлся.
    win.NF.origin.useGazetteer([{ name: 'Chatham', lat: 51.3813, lng: 0.5169 }]);

    assert.strictEqual(win.NF.origin.fromTimeZone('Pacific/Chatham'), null);
});

test('обычный пояс опознаётся по имени города', () => {
    const win = setup();
    const point = win.NF.origin.fromTimeZone('Europe/Moscow');

    assert.strictEqual(point.name, 'Moscow');
    assert.strictEqual(point.source, 'zone');
    // Подчёркивания в именах поясов — это пробелы: America/New_York.
    assert.strictEqual(win.NF.origin.fromTimeZone('UTC'), null, 'пояс без региона — не город');
});

test('отсутствие navigator.geolocation не мешает поясу отработать', async () => {
    // jsdom геолокацию не реализует вовсе — ровно тот случай, на котором
    // в прототипе молча выключалась половина функциональности.
    const win = setup();
    assert.strictEqual(win.navigator.geolocation, undefined, 'проверка предпосылки теста');

    const point = await win.NF.origin.detect();

    assert.ok(point, 'пояс обязан сработать без геолокации');
    assert.strictEqual(point.name, 'Moscow', 'TZ процесса задан как Europe/Moscow');
    assert.strictEqual(point.source, 'zone');
});

test('без геолокации и без опознанного пояса detect честно возвращает null', async () => {
    // null здесь — это «спроси человека», и страница обязана это предложить.
    const win = setup({ gazetteer: false });
    assert.strictEqual(await win.NF.origin.detect(), null);
});

test('геолокация уточняет точку и подписывает её ближайшим городом', async () => {
    const win = setup({ geolocation: allowGeo(55.80, 37.50) });
    const point = await win.NF.origin.detect();

    assert.strictEqual(point.source, 'gps');
    assert.strictEqual(point.name, 'Moscow');
    assert.strictEqual(point.lat, 55.80);
});

test('выбранную вручную точку определение не отбирает', async () => {
    const win = setup({ geolocation: allowGeo(51.5074, -0.1278) });
    win.NF.origin.set({ lat: 23.1291, lng: 113.2644, name: 'Гуанчжоу' });

    const point = await win.NF.origin.detect();

    assert.strictEqual(point.name, 'Гуанчжоу');
    assert.strictEqual(point.source, 'manual');
});

test('отказ в геолокации оставляет точку по поясу', async () => {
    const win = setup({
        geolocation: {
            getCurrentPosition(onOk, onFail) { onFail({ code: 1, message: 'отказано' }); },
        },
    });
    const point = await win.NF.origin.detect();

    assert.strictEqual(point.source, 'zone');
    assert.strictEqual(point.name, 'Moscow');
});

test('молчащая геолокация не подвешивает страницу', async () => {
    // Браузер может не вызвать ни один колбэк. Промис всё равно обязан
    // разрешиться — иначе страница ждёт вечно.
    const win = setup({ geolocation: { getCurrentPosition() {} } });
    const point = await win.NF.origin.detect({ timeout: 10 });

    assert.strictEqual(point.source, 'zone');
});

// --- Безопасность ------------------------------------------------------------

test('координаты никуда не отправляются', async () => {
    let calls = 0;
    const win = setup({ geolocation: allowGeo(55.80, 37.50) });
    win.fetch = function () { calls += 1; return Promise.resolve(); };
    win.XMLHttpRequest = function () { calls += 1; };
    win.navigator.sendBeacon = function () { calls += 1; return true; };

    const point = await win.NF.origin.detect();

    assert.strictEqual(point.source, 'gps', 'координаты получены');
    assert.strictEqual(calls, 0, 'и при этом ни одного обращения в сеть');

    // Второй рубеж — сам текст модуля: сеть не должна появиться там и позже.
    // Комментарии из проверки вырезаны нарочно: они как раз обязаны называть
    // запрещённое по имени, иначе правило негде объяснить.
    const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'navigator.send', 'NF.api', 'supabase']
        .forEach(function (marker) {
            assert.strictEqual(code.indexOf(marker), -1,
                'в коде origin.js не должно быть ' + marker);
        });
});

// --- Расстояние --------------------------------------------------------------

test('расстояние совпадает с независимо посчитанным', () => {
    const win = setup();
    win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });

    // Сверено сферической теоремой косинусов (другая формула, тот же радиус
    // 6371 км): Москва → Лондон 2500.5 км, Москва → Гуанчжоу 7012.4 км.
    assert.ok(Math.abs(win.NF.origin.distanceKm(51.5074, -0.1278) - 2500.5) < 1,
        'Москва → Лондон');
    assert.ok(Math.abs(win.NF.origin.distanceKm(23.1291, 113.2644) - 7012.4) < 1,
        'Москва → Гуанчжоу');
    assert.strictEqual(Math.round(win.NF.origin.distanceKm(55.7558, 37.6173)), 0,
        'расстояние до самой себя — ноль, а не NaN');
});

test('линия перемены дат не ломает расстояние', () => {
    const win = setup();
    // Нанди, Фиджи: 177.44 E. Паго-Паго, Самоа: 170.70 W. По долготе между ними
    // 348 градусов, по земле — 1325.8 км (сверено той же независимой формулой).
    win.NF.origin.set({ lat: -17.7765, lng: 177.4356, name: 'Нанди' });

    assert.ok(Math.abs(win.NF.origin.distanceKm(-14.2756, -170.7020) - 1325.8) < 1,
        'через 180-й меридиан расстояние должно идти коротким путём');
});

test('без точки отсчёта и с негодными координатами расстояние — null', () => {
    const win = setup();
    assert.strictEqual(win.NF.origin.distanceKm(51.5074, -0.1278), null);

    win.NF.origin.set({ lat: 55.7558, lng: 37.6173 });
    assert.strictEqual(win.NF.origin.distanceKm(91, 0), null);
    assert.strictEqual(win.NF.origin.distanceKm(null, null), null);
    assert.strictEqual(win.NF.origin.distanceKm('туда', 'обратно'), null);
});

// --- Оценки, помеченные как оценки -------------------------------------------

test('время перелёта возвращается с объяснением, а не голым числом', () => {
    const win = setup();
    const flight = win.NF.origin.flightMinutes(1000);

    // 1000 км / 850 км/ч = 70.6 мин, плюс 45 мин на взлёт-посадку.
    assert.strictEqual(flight.minutes, 116);
    assert.strictEqual(flight.assumed, true, 'это оценка, и она обязана быть подписана');
    assert.strictEqual(flight.cruiseKmh, 850);
    assert.strictEqual(flight.groundMinutes, 45);
    assert.ok(flight.explain.indexOf('850') !== -1, 'объяснение показывает, из чего собрано число');
    assert.strictEqual(win.NF.origin.flightMinutes(-5), null);
    assert.strictEqual(win.NF.origin.flightMinutes('далеко'), null);
});

test('местное время по долготе — солнечное, с шагом в час', () => {
    const win = setup();
    const noonUTC = new Date('2026-09-16T09:00:00Z');

    // 37.6 E → округляется до трёх часов: 09:00 UTC это 12:00 солнечного.
    assert.strictEqual(win.NF.origin.localTime(37.6173, noonUTC), '12:00');
    assert.strictEqual(win.NF.origin.localTime(0, noonUTC), '09:00');
    // 113.26 E → восемь часов: 17:00. За полночь время переходит корректно.
    assert.strictEqual(win.NF.origin.localTime(113.2644, noonUTC), '17:00');
    assert.strictEqual(win.NF.origin.localTime(-170.7020, noonUTC), '22:00');
    assert.strictEqual(win.NF.origin.localTime(181, noonUTC), null);
    assert.strictEqual(win.NF.origin.localTime(37, 'вчера'), null);
});

// --- Подписки ----------------------------------------------------------------

test('подписка получает каждое изменение, отписка прекращает это', () => {
    const win = setup();
    const seen = [];
    const off = win.NF.origin.onChange(function (point) {
        seen.push(point ? point.name : null);
    });

    win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });
    win.NF.origin.set({ lat: 51.5074, lng: -0.1278, name: 'Лондон' });
    win.NF.origin.clear();
    off();
    win.NF.origin.set({ lat: 23.1291, lng: 113.2644, name: 'Гуанчжоу' });

    assert.deepStrictEqual(Array.from(seen), ['Москва', 'Лондон', null],
        'после отписки уведомлений быть не должно');
});

test('упавший подписчик не отменяет остальных', () => {
    const win = setup();
    let reached = 0;
    win.NF.origin.onChange(function () { throw new Error('сломался'); });
    win.NF.origin.onChange(function () { reached += 1; });

    win.NF.origin.set({ lat: 55.7558, lng: 37.6173, name: 'Москва' });

    assert.strictEqual(reached, 1);
});
