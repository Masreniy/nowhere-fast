/**
 * Общее для сверок справочника: сдвиг десятичной строки, хэш, сравнение.
 *
 * Появился на втором применении, а не заранее: сверок стало две —
 * `verify-cities.js` и `verify-countries.js`, — и обе считают одно и то же
 * одинаково. Разойдись они в округлении хоть на единицу, обе начнут врать,
 * причём в разные стороны.
 *
 * Правило, которое здесь держится: всё, что сравнивается с SQL, считается
 * над десятичной **строкой**, а не над числом с плавающей точкой. Postgres
 * округляет `numeric`, JavaScript — двоичную дробь, и на пятом знаке они
 * расходятся. Сверка, которая расходится сама с собой, бесполезна.
 */
'use strict';

const crypto = require('node:crypto');

/**
 * Сдвигает десятичную строку на `digits` знаков, не превращая её в double.
 * «36.1893» при пяти знаках даёт 3618930 — ровно то же, что `numeric` в базе.
 *
 * Лишние знаки отрезаются, а не округляются. В источниках их не бывает;
 * если появятся, предсказуемый обрез лучше молчаливого округления, которое
 * разойдётся с `round()` в SQL ровно на половине случаев.
 */
function scaleDecimal(text, digits) {
    const negative = String(text).charAt(0) === '-';
    const digitsOnly = negative ? String(text).slice(1) : String(text);
    const parts = digitsOnly.split('.');
    const fraction = (parts[1] || '').slice(0, digits);
    const padded = parts[0] + fraction + '0'.repeat(digits - fraction.length);
    const value = Number(padded);
    return negative ? -value : value;
}

function md5(text) {
    return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

/**
 * Сравнивает ожидаемое с ответом базы. Сравнение по строкам намеренно:
 * `bigint` приезжает из Postgres строкой, и строгое равенство типов
 * объявило бы расхождением совпадение.
 */
function compare(expected, actual) {
    const answer = actual || {};
    return Object.keys(expected).filter(function (key) {
        return String(expected[key]) !== String(answer[key]);
    }).map(function (key) {
        return key + ': в источнике ' + expected[key] + ', в базе ' + answer[key];
    });
}

function printTotals(title, totals) {
    process.stdout.write(title + '\n');
    Object.keys(totals).forEach(function (key) {
        process.stdout.write('  ' + key + ' = ' + totals[key] + '\n');
    });
}

/** Ответ базы приходит массивом из одной строки — принимаем и массив, и объект. */
function firstRow(json) {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed[0] : parsed;
}

/** Итог сверки на экран. Возвращает код выхода: 0 — сошлось, 1 — нет. */
function reportComparison(expected, answerJson) {
    const problems = compare(expected, firstRow(answerJson));
    if (problems.length === 0) {
        process.stdout.write('\nсверка сошлась: в базе то же, что в источнике\n');
        return 0;
    }
    process.stdout.write('\nРАСХОЖДЕНИЕ:\n' + problems.join('\n') + '\n');
    return 1;
}

module.exports = {
    scaleDecimal: scaleDecimal,
    md5: md5,
    compare: compare,
    printTotals: printTotals,
    firstRow: firstRow,
    reportComparison: reportComparison
};
