/**
 * Календарные метки поездки.
 *
 * Зачем этот файл существует. Планировщик живёт сразу в трёх часовых поясах:
 * браузер пользователя, город поездки и UTC, в котором Postgres отдаёт
 * timestamptz. Между ними не два часа, а пять-восемь: Москва и Гуанчжоу
 * расходятся на пять. Классическая ошибка — взять текущий момент и попросить
 * у него `toISOString`: это всегда UTC-дата, и ночью у пользователя «сегодня»
 * молча откатывается на вчера, а в городе поездки — уезжает на завтра.
 * Первый день плана в обоих случаях сдвигается на сутки.
 *
 * (Связка «текущий момент → строка UTC» здесь намеренно не записана кодом:
 * её ищет тест в tests/dates.test.js по всем файлам сразу, и упоминание
 * в пояснении заставило бы его краснеть на собственной документации.)
 *
 * Тонкость, ради которой модуль и заведён отдельно: **запрет UTC не абсолютен.**
 *
 *   - Момент времени («когда это случилось») в UTC показывать нельзя — его
 *     нужно переводить в пояс того, кто смотрит, или того города, о котором речь.
 *   - Арифметика над календарными метками («сколько дней между 1 и 3 апреля»)
 *     наоборот обязана идти в UTC. В местном поясе сутки перехода на летнее
 *     время длятся 23 или 25 часов, и деление разницы на 24 часа даёт
 *     то 0.958, то 1.042 дня — а значит съеденный или лишний день плана.
 *     Поэтому ниже дата всегда фиксируется как T00:00:00Z: в UTC сутки
 *     ровно 86 400 000 мс всегда и везде.
 *
 * Календарная метка здесь — строка YYYY-MM-DD. Это не момент времени: у «1 апреля»
 * нет часа и нет пояса, это клетка календаря. Объект Date внутри модуля —
 * технический носитель для арифметики, наружу он не выходит.
 *
 * Модуль чистый: ни document, ни сети, ни обращений к NF.api. «Сейчас» всегда
 * можно подать аргументом — иначе функцию, зависящую от текущего момента,
 * нельзя проверить тестом, а именно она и ломается раз в полгода.
 */
window.NF = window.NF || {};

NF.dates = (function () {
    'use strict';

    /** Миллисекунд в сутках. Верно только для UTC — см. пояснение в шапке файла. */
    const DAY_MS = 86400000;

    /** Формат календарной метки. Ровно четыре цифры года: «26-04-01» — не дата. */
    const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

    /**
     * Потолок длины поездки.
     *
     * Нужен не ради красоты, а чтобы опечатка в годе («2026» → «2226») не
     * развернулась в массив на семьдесят тысяч элементов и не подвесила вкладку.
     */
    const MAX_TRIP_DAYS = 366;

    /** Месяцы в родительном падеже: показываем «1 апреля», а не «1 апрель». */
    const MONTHS_GENITIVE = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];

    /** Дополняет число нулём слева: 4 → «04». */
    function pad(n) {
        return String(n).padStart(2, '0');
    }

    /**
     * Приводит аргумент «сейчас» к пригодному Date.
     *
     * Проверка идёт через Object.prototype.toString, а не через instanceof:
     * Date, созданный в другом realm (в тесте — в процессе Node, а код
     * выполняется внутри окна jsdom), проверку instanceof не проходит,
     * хотя это полноценная дата. Из браузера это же приходит из iframe.
     * Ошибка при этом молчаливая: функция делает вид, что аргумента не было,
     * и берёт текущий момент — ровно та подмена, ради обнаружения которой
     * аргумент и заведён.
     */
    function asDate(value) {
        if (value === undefined || value === null) return new Date();
        if (Object.prototype.toString.call(value) !== '[object Date]') return null;
        if (isNaN(value.getTime())) return null;
        return value;
    }

    /**
     * Календарная метка → миллисекунды полуночи UTC. Невалидная дата → null.
     *
     * Проверка идёт обратным ходом: Date.UTC молча переносит 31 февраля
     * на 2 или 3 марта, а год 50 превращает в 1950. Поэтому собранную дату
     * разбираем назад и сверяем с тем, что пришло, — если разошлось,
     * даты такой не существует.
     */
    function toUTC(iso) {
        const parts = ISO_RE.exec(String(iso));
        if (!parts) return null;

        const ms = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));

        // Обратный ход одной строкой: если собранная дата, разобранная назад,
        // не совпала со строкой посимвольно — такой даты не существует.
        // Сверять по отдельности год, месяц и день не нужно: любой перенос
        // меняет саму строку.
        return fromUTC(ms) === parts[0] ? ms : null;
    }

    /** Миллисекунды UTC → календарная метка. */
    function fromUTC(ms) {
        const d = new Date(ms);
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }

    /** Проверяет, что перед нами существующая дата в формате YYYY-MM-DD. */
    function isValidISO(value) {
        return toUTC(value) !== null;
    }

    /**
     * «Сегодня» у пользователя — по часам его браузера.
     *
     * Собирается из местных полей Date (getFullYear и соседи), а не из UTC:
     * в 23:30 по Москве UTC-дата уже завтрашняя, и пользователь получил бы
     * поездку, начинающуюся «вчера».
     *
     * @param {Date} [now] момент отсчёта; по умолчанию текущий
     */
    function todayLocalISO(now) {
        const d = asDate(now);
        if (d === null) return null;
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    /**
     * «Сегодня» в городе поездки.
     *
     * Локаль en-CA выбрана не за язык, а за формат: она единственная
     * из ходовых даёт ровно YYYY-MM-DD, без перестановки дня и месяца
     * и без надобности склеивать части руками.
     *
     * Неизвестный или пустой пояс — не повод падать: показываем дату
     * пользователя. У городов в базе поле timezone заполнено не у всех,
     * а планировщик должен работать и без него.
     *
     * @param {string} timeZone имя пояса IANA, например 'Asia/Shanghai'
     * @param {Date} [now] момент отсчёта; по умолчанию текущий
     */
    function todayInCityISO(timeZone, now) {
        const d = asDate(now);
        if (d === null) return null;
        if (!timeZone) return todayLocalISO(d);

        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone }).format(d);
        } catch (error) {
            // Пояса с таким именем нет — Intl бросает RangeError.
            console.warn('NF.dates: неизвестный часовой пояс:', timeZone);
            return todayLocalISO(d);
        }
    }

    /**
     * Прибавляет дни к календарной метке. Отрицательное n вычитает.
     * Невалидная метка → null.
     */
    function isoPlusDays(iso, n) {
        const ms = toUTC(iso);
        if (ms === null) return null;

        const days = Number(n);
        if (!Number.isFinite(days)) return null;

        return fromUTC(ms + Math.trunc(days) * DAY_MS);
    }

    /**
     * Сколько дней от a до b. Если b раньше a — число отрицательное.
     * Любая невалидная метка → null.
     */
    function isoDiffDays(a, b) {
        const from = toUTC(a);
        const to = toUTC(b);
        if (from === null || to === null) return null;

        return Math.round((to - from) / DAY_MS);
    }

    /**
     * Длина поездки в днях.
     *
     * Поездка с 1 по 3 апреля — это три дня, а не два: границы включаются обе.
     * Отсюда «+1». Поездка в один день (от = до) — один день, не ноль,
     * отсюда Math.max.
     */
    function tripDays(from, to) {
        const diff = isoDiffDays(from, to);
        if (diff === null) return null;
        return Math.max(1, diff + 1);
    }

    /**
     * Все даты поездки подряд, включая обе границы.
     * Поездка длиннее MAX_TRIP_DAYS считается опечаткой и не разворачивается.
     */
    function listTripDates(from, to) {
        const total = tripDays(from, to);
        if (total === null) return null;

        if (total > MAX_TRIP_DAYS) {
            console.warn('NF.dates: поездка длиннее ' + MAX_TRIP_DAYS + ' дней:', from, to);
            return null;
        }

        const dates = [];
        for (let i = 0; i < total; i += 1) dates.push(isoPlusDays(from, i));
        return dates;
    }

    /**
     * Дата для показа человеку: «1 апреля».
     *
     * Словарь, а не Intl с локалью ru: Intl в браузерах даёт «1 апр.» или
     * «1 апреля г.» в зависимости от набора опций и версии, а формат в интерфейсе
     * должен быть один и тот же всегда. Двенадцать строк дешевле, чем зависимость
     * от чужих таблиц локализации.
     */
    function formatHuman(iso) {
        const parts = ISO_RE.exec(String(iso));
        if (!parts || !isValidISO(iso)) return null;

        return Number(parts[3]) + ' ' + MONTHS_GENITIVE[Number(parts[2]) - 1];
    }

    return {
        todayLocalISO: todayLocalISO,
        todayInCityISO: todayInCityISO,
        isoPlusDays: isoPlusDays,
        isoDiffDays: isoDiffDays,
        tripDays: tripDays,
        listTripDates: listTripDates,
        isValidISO: isValidISO,
        formatHuman: formatHuman,
        MAX_TRIP_DAYS: MAX_TRIP_DAYS,
    };
})();
