/**
 * Проверка языка интерфейса.
 *
 * Что здесь закрывается. Язык — свойство всего проекта, а не отдельной
 * страницы: он лежит в одном ключе хранилища и обязан переживать переход
 * по ссылке. Ошибки этого слоя тихие. Пропавший ключ не роняет страницу,
 * а рисует пустое место; забытый dir оставляет арабский текст прижатым
 * влево; недоступное хранилище в приватном окне валит модуль целиком,
 * и вместе с ним всю страницу.
 *
 * Оси проверки, объявленные при написании модуля:
 *   1. выбор языка при первом заходе (хранилище старше navigator);
 *   2. смена языка — lang, dir, хранилище, извещение подписчиков;
 *   3. перевод разметки: текст и атрибуты;
 *   4. пропавший ключ виден, а не проглочен;
 *   5. недоступное хранилище не роняет модуль;
 *   6. разметка переключателя не собирается строкой.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/**
 * Поднимает документ и загружает в него слой языка.
 *
 * Порядок повторяет порядок подключения в страницах: dom.js даёт безопасное
 * построение разметки, i18n-strings.js — словари, i18n.js — механику.
 *
 * @param {Object} [options]
 *   body           — разметка внутри <body>
 *   languages      — что отдаёт navigator.languages
 *   stored         — что уже лежит в localStorage
 *   brokenStorage  — хранилище бросает при любом обращении
 */
function setup(options) {
    const opts = options || {};
    const dom = new JSDOM('<!doctype html><html lang="ru"><body>' +
        (opts.body || '') + '</body></html>', {
        runScripts: 'outside-only', url: 'https://example.com/index.html',
    });
    const win = dom.window;

    if (opts.brokenStorage) {
        Object.defineProperty(win, 'localStorage', {
            configurable: true,
            get() { throw new Error('хранилище недоступно'); },
        });
    } else if (opts.stored !== undefined) {
        win.localStorage.setItem('nf.lang', opts.stored);
    }

    // Язык браузера задаётся всегда, даже когда тест о нём не говорит:
    // по умолчанию jsdom представляется как en-US, и тесты про русские строки
    // зеленели бы или краснели в зависимости от настроек среды. Та же причина,
    // по которой tests/dates.test.js прибивает часовой пояс.
    const languages = opts.languages || ['ru-RU'];
    Object.defineProperty(win.navigator, 'languages', {
        configurable: true,
        get() { return languages; },
    });
    Object.defineProperty(win.navigator, 'language', {
        configurable: true,
        get() { return languages[0]; },
    });

    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/dom.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/i18n-strings.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/i18n.js'), 'utf8'));
    return win;
}

// --- Ось 1: язык при первом заходе -------------------------------------------

test('без сохранённого выбора язык берётся из браузера', () => {
    const win = setup({ languages: ['de-AT', 'en-US'] });
    assert.strictEqual(win.NF.i18n.lang(), 'de', 'основная часть метки «de-AT» — это de');
});

test('незнакомый язык браузера даёт русский', () => {
    const win = setup({ languages: ['sv-SE'] });
    assert.strictEqual(win.NF.i18n.lang(), 'ru');
});

test('сохранённый выбор старше языка браузера', () => {
    // Человек однажды переключил язык руками. Менять его за него нельзя,
    // даже если браузер просит другой.
    const win = setup({ languages: ['de-DE'], stored: 'ja' });
    assert.strictEqual(win.NF.i18n.lang(), 'ja');
});

test('мусор в хранилище не делает язык мусором', () => {
    const win = setup({ languages: ['fr-FR'], stored: 'эльфийский' });
    assert.strictEqual(win.NF.i18n.lang(), 'fr');
});

test('языков ровно десять, арабский пишется справа налево', () => {
    const win = setup();
    const langs = Array.from(win.NF.i18n.LANGS);
    assert.strictEqual(langs.length, 10);

    const rtl = langs.filter(function (item) { return item.dir === 'rtl'; });
    assert.deepStrictEqual(rtl.map(function (item) { return item.code; }), ['ar'],
        'справа налево пишется только арабский');
});

// --- Ось 2: смена языка -------------------------------------------------------

test('смена языка меняет lang и dir документа', () => {
    const win = setup();
    win.NF.i18n.set('ar');

    assert.strictEqual(win.document.documentElement.getAttribute('lang'), 'ar');
    assert.strictEqual(win.document.documentElement.getAttribute('dir'), 'rtl');

    win.NF.i18n.set('ja');
    assert.strictEqual(win.document.documentElement.getAttribute('lang'), 'ja');
    assert.strictEqual(win.document.documentElement.getAttribute('dir'), 'ltr',
        'после арабского направление обязано вернуться');
});

test('выбранный язык переживает перезагрузку страницы', () => {
    const win = setup({ languages: ['en-GB'] });
    win.NF.i18n.set('pt');
    assert.strictEqual(win.localStorage.getItem('nf.lang'), 'pt');

    // Второй документ с тем же хранилищем — это и есть «открыл другую страницу».
    const again = setup({ languages: ['en-GB'], stored: 'pt' });
    assert.strictEqual(again.NF.i18n.lang(), 'pt');
});

test('неизвестный язык не принимается', () => {
    const win = setup();
    const before = win.NF.i18n.lang();
    assert.strictEqual(win.NF.i18n.set('эсперанто'), false);
    assert.strictEqual(win.NF.i18n.lang(), before);
});

test('подписка вызывается, отписка работает', () => {
    const win = setup();
    const seen = [];
    const off = win.NF.i18n.onChange(function (code) { seen.push(code); });

    win.NF.i18n.set('es');
    win.NF.i18n.set('de');
    off();
    win.NF.i18n.set('fr');

    assert.deepStrictEqual(seen, ['es', 'de'], 'после отписки извещений быть не должно');
});

test('упавший подписчик не мешает остальным', () => {
    const win = setup();
    const seen = [];
    win.NF.i18n.onChange(function () { throw new Error('подписчик сломан'); });
    win.NF.i18n.onChange(function (code) { seen.push(code); });

    win.NF.i18n.set('zh');
    assert.deepStrictEqual(seen, ['zh']);
});

// --- Ось 3: перевод разметки --------------------------------------------------

test('apply переводит текст и атрибуты', () => {
    const win = setup({
        body: '<h1 data-i18n="nav.home"></h1>' +
              '<input id="field" data-i18n-attr="placeholder:trip.from, title:trip.to" />',
    });
    win.NF.i18n.set('en');

    assert.strictEqual(win.document.querySelector('h1').textContent, 'Home');
    const field = win.document.getElementById('field');
    assert.strictEqual(field.getAttribute('placeholder'), 'From');
    assert.strictEqual(field.getAttribute('title'), 'To');

    win.NF.i18n.set('ru');
    assert.strictEqual(win.document.querySelector('h1').textContent, 'Главная');
    assert.strictEqual(field.getAttribute('placeholder'), 'С какого числа');
});

test('apply переводит и сам корень, а не только его детей', () => {
    const win = setup({ body: '<p id="one" data-i18n="nav.cities"></p>' });
    win.NF.i18n.apply(win.document.getElementById('one'));
    assert.strictEqual(win.document.getElementById('one').textContent, 'Города');
});

test('apply не выходит за пределы переданного корня', () => {
    const win = setup({
        body: '<div id="inside"><p data-i18n="nav.home"></p></div>' +
              '<p id="outside" data-i18n="nav.cities">не трогать</p>',
    });
    win.NF.i18n.apply(win.document.getElementById('inside'));
    assert.strictEqual(win.document.getElementById('outside').textContent, 'не трогать');
});

test('исполняемый атрибут через словарь не подставляется', () => {
    // Словарь наш, но запрет держится списком, а не доверием: сегодня строки
    // пишет разработчик, завтра их подтянут из базы.
    const win = setup({ body: '<div id="evil" data-i18n-attr="onclick:nav.home"></div>' });
    win.NF.i18n.apply(win.document);
    assert.strictEqual(win.document.getElementById('evil').hasAttribute('onclick'), false);
});

test('перевод попадает в документ текстом, а не разметкой', () => {
    const win = setup({ body: '<p id="one" data-i18n="difficulty.easy"></p>' });
    win.NF.i18n.apply(win.document);
    const node = win.document.getElementById('one');
    assert.strictEqual(node.childNodes.length, 1);
    assert.strictEqual(node.childNodes[0].nodeType, 3, 'внутри обязан быть текстовый узел');
});

// --- Ось 4: пропавший ключ ----------------------------------------------------

test('отсутствующий ключ возвращает сам себя и говорит об этом', () => {
    const win = setup();
    const said = [];
    win.console.warn = function () { said.push(Array.prototype.join.call(arguments, ' ')); };

    assert.strictEqual(win.NF.i18n.t('такого.ключа.нет'), 'такого.ключа.нет');
    assert.strictEqual(said.length, 1, 'о пропаже надо сказать');

    win.NF.i18n.t('такого.ключа.нет');
    assert.strictEqual(said.length, 1, 'но ровно один раз, иначе консоль зальёт');
});

test('непереведённая строка показывается по-английски, а не ключом', () => {
    const win = setup();
    win.NF.i18n.set('ja');
    // Раздел админки переведён только на русский и английский — см. шапку словаря.
    assert.strictEqual(win.NF.i18n.t('admin.needName'), 'Enter the name of the place');
});

test('подстановка и формы числа работают по правилам языка', () => {
    const win = setup();
    const i18n = win.NF.i18n;

    assert.strictEqual(i18n.t('unit.days', { n: 1 }), '1 день');
    assert.strictEqual(i18n.t('unit.days', { n: 3 }), '3 дня');
    assert.strictEqual(i18n.t('unit.days', { n: 8 }), '8 дней');

    i18n.set('en');
    assert.strictEqual(i18n.t('unit.days', { n: 1 }), '1 day');
    assert.strictEqual(i18n.t('unit.days', { n: 8 }), '8 days');
});

test('число форматируется по правилам языка', () => {
    const win = setup();
    assert.strictEqual(win.NF.i18n.n(1234).replace(/ | /g, ' '), '1 234');
    win.NF.i18n.set('en');
    assert.strictEqual(win.NF.i18n.n(1234), '1,234');
});

// --- Ось 5: недоступное хранилище ---------------------------------------------

test('недоступное хранилище не роняет модуль', () => {
    const win = setup({ brokenStorage: true, languages: ['fr-FR'] });

    assert.strictEqual(win.NF.i18n.lang(), 'fr', 'язык берётся из браузера');
    assert.strictEqual(win.NF.i18n.set('de'), true, 'переключение обязано работать и так');
    assert.strictEqual(win.NF.i18n.lang(), 'de');
    assert.strictEqual(win.document.documentElement.getAttribute('lang'), 'de');
});

// --- Ось 6: переключатель -----------------------------------------------------

test('переключатель строится узлами и переключает язык', () => {
    const win = setup({ body: '<div id="switch"></div>' });
    const host = win.document.getElementById('switch');
    const select = win.NF.i18n.mountSwitcher(host);

    assert.strictEqual(select.tagName, 'SELECT');
    assert.strictEqual(select.options.length, 10);
    assert.strictEqual(select.value, win.NF.i18n.lang());
    assert.ok(host.classList.contains('lang-switcher'));
    assert.ok(select.getAttribute('aria-label'), 'переключателю нужна подпись для читалки');

    select.value = 'es';
    select.dispatchEvent(new win.Event('change'));
    assert.strictEqual(win.NF.i18n.lang(), 'es');
    assert.strictEqual(win.document.documentElement.getAttribute('lang'), 'es');
});

test('переключатель догоняет язык, сменённый не через него', () => {
    const win = setup({ body: '<div id="switch"></div>' });
    const select = win.NF.i18n.mountSwitcher(win.document.getElementById('switch'));

    win.NF.i18n.set('hi');
    assert.strictEqual(select.value, 'hi');
});

// --- Разметка не собирается строкой -------------------------------------------

test('в слое языка нет сборки разметки строкой', () => {
    // Тот же сторож, что и в tests/dom.test.js: возврат innerHTML сюда —
    // это возврат XSS. Ищем присваивание, а не слово: в пояснениях оно есть.
    // Имена запрещённых вызовов склеены из кусков намеренно: тот же запрет
    // сторожит хук warn-on-innerhtml.sh, и целое имя в этой строке заставило бы
    // его ругаться на собственный тест — а сторожа, который кричит зря,
    // перестают читать.
    const assignment = new RegExp('\\.(inner|outer)HTML\\s*\\+?=');
    const insertion = new RegExp('insertAdjacent' + 'HTML|document\\.' + 'write');

    ['assets/js/i18n.js', 'assets/js/i18n-strings.js'].forEach(function (file) {
        const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(!assignment.test(source), file + ': присваивание разметки строкой');
        assert.ok(!insertion.test(source), file + ': вставка разметки строкой');
    });
});

test('каждый ключ словаря знает русский', () => {
    // Русский — язык оригинала и последняя ступень запасного пути.
    // Ключ без русской строки показал бы ключ вместо текста.
    const win = setup();
    const strings = win.NF.i18nStrings;
    const broken = Object.keys(strings).filter(function (key) {
        return typeof strings[key].ru !== 'string';
    });
    assert.deepStrictEqual(broken, []);
});
