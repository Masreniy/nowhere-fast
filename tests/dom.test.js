/**
 * Проверка безопасного построения разметки.
 *
 * Это первый тест проекта, и он закрывает XSS намеренно: по .claude/rules/testing.md
 * регрессия в экранировании пользовательских данных опаснее любой другой.
 *
 * Запуск:  npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/** Поднимает чистый документ и загружает в него config.js и dom.js. */
function setup() {
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
        runScripts: 'outside-only',
    });
    const win = dom.window;
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'));
    win.eval(fs.readFileSync(path.join(ROOT, 'assets/js/dom.js'), 'utf8'));
    return win;
}

/** Классические полезные нагрузки, которыми пользуются при атаке. */
const PAYLOADS = [
    '<script>window.__pwned = true;</script>',
    '<img src=x onerror="window.__pwned = true">',
    '"><svg onload="window.__pwned=1">',
    "'; alert(1); //",
    '<iframe src="javascript:alert(1)"></iframe>',
    '<a href="javascript:alert(1)">клик</a>',
];

test('текст с разметкой не превращается в узлы документа', () => {
    const win = setup();
    const root = win.document.getElementById('root');

    for (const payload of PAYLOADS) {
        const node = win.NF.dom.el('h3', { text: payload });
        win.NF.dom.replace(root, node);

        assert.strictEqual(root.querySelectorAll('script').length, 0, 'создан <script>');
        assert.strictEqual(root.querySelectorAll('img, svg, iframe, a').length, 0,
            'разметка из данных стала узлом: ' + payload);
        assert.strictEqual(node.textContent, payload, 'текст исказился');
        assert.strictEqual(win.__pwned, undefined, 'код из данных выполнился');
    }
});

test('атрибуты-обработчики не устанавливаются', () => {
    const win = setup();
    const node = win.NF.dom.el('div', {
        attrs: { onclick: 'window.__pwned = true', onmouseover: 'window.__pwned = true' },
    });
    assert.strictEqual(node.getAttribute('onclick'), null);
    assert.strictEqual(node.getAttribute('onmouseover'), null);
});

test('исполняемые схемы ссылок отклоняются', () => {
    const win = setup();
    const bad = [
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
    ];
    for (const href of bad) {
        const node = win.NF.dom.el('a', { attrs: { href } });
        assert.strictEqual(node.getAttribute('href'), null, 'пропущена ссылка: ' + href);
        assert.strictEqual(win.NF.dom.safeUrl(href), null);
    }
});

test('protocol-relative ссылки отклоняются', () => {
    const win = setup();
    // Кода не выполняет, но подставляет содержимое с чужого домена
    // и относительным путём не является.
    for (const href of ['//evil.example.com/x', '//evil.example.com']) {
        assert.strictEqual(win.NF.dom.safeUrl(href), null, 'пропущена ссылка: ' + href);
    }
});

test('проверка схемы действует не только на href и src', () => {
    const win = setup();
    // formaction у кнопки и action у формы тоже принимают javascript:
    const cases = [
        ['form', 'action'],
        ['button', 'formaction'],
        ['video', 'poster'],
        ['blockquote', 'cite'],
    ];
    for (const [tag, attr] of cases) {
        const node = win.NF.dom.el(tag, { attrs: { [attr]: 'javascript:alert(1)' } });
        assert.strictEqual(node.getAttribute(attr), null,
            tag + '[' + attr + '] пропустил исполняемую схему');
    }
});

test('обычные ссылки продолжают работать', () => {
    const win = setup();
    const good = ['https://example.com/a', 'city.html?id=1', '/about', '#cities', 'mailto:a@b.c'];
    for (const href of good) {
        const node = win.NF.dom.el('a', { attrs: { href } });
        assert.strictEqual(node.getAttribute('href'), href, 'отклонена рабочая ссылка: ' + href);
    }
});

test('строки среди детей добавляются как текст', () => {
    const win = setup();
    const root = win.document.getElementById('root');
    win.NF.dom.replace(root, win.NF.dom.el('p', {}, ['<b>жирный</b>']));
    assert.strictEqual(root.querySelectorAll('b').length, 0);
    assert.match(root.textContent, /<b>жирный<\/b>/);
});

test('картинка с исполняемым src подменяется заглушкой', () => {
    const win = setup();
    const node = win.NF.dom.image('javascript:alert(1)', 'алт');
    assert.strictEqual(node.getAttribute('src'), win.NF.config.FALLBACK_IMAGE);
});

test('value() не показывает undefined пользователю', () => {
    const win = setup();
    assert.strictEqual(win.NF.dom.value(undefined), '—');
    assert.strictEqual(win.NF.dom.value(null), '—');
    assert.strictEqual(win.NF.dom.value('   '), '—');
    assert.strictEqual(win.NF.dom.value('Гуанчжоу'), 'Гуанчжоу');
    assert.strictEqual(win.NF.dom.value(0), '0');
});
