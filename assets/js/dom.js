/**
 * Безопасное построение разметки.
 *
 * Зачем этот файл существует. Предыдущая версия страниц собирала HTML строками
 * и вставляла через innerHTML, подставляя туда данные из базы и параметр ?city=
 * из адреса. Это давало XSS: и отражённую (через ссылку), и хранимую (через
 * запись в базу). Любое значение, пришедшее снаружи, могло выполниться как код.
 *
 * Здесь нет ни одного присваивания innerHTML с данными. Текст всегда попадает
 * в документ через textContent, атрибуты — через setAttribute. Браузер трактует
 * их как данные, а не как разметку, поэтому экранирование не нужно в принципе:
 * экранировать нечего.
 *
 * Правило: если понадобилось собрать разметку строкой — значит нужен новый
 * помощник здесь, а не исключение из правила там.
 */
window.NF = window.NF || {};

NF.dom = (function () {
    'use strict';

    /** Атрибуты, значение которых браузер может выполнить как код. */
    const DANGEROUS_ATTR = /^(on|xlink:|srcdoc$)/i;

    /**
     * Атрибуты, содержащие ссылку.
     *
     * Список шире, чем href и src, намеренно: formaction у кнопки и action у формы
     * тоже принимают javascript:, и проверка, привязанная к двум именам, их бы
     * пропустила. Ошибиться здесь можно ровно один раз — при добавлении нового
     * вызова el() с непривычным атрибутом.
     */
    const URL_ATTR = [
        'href', 'src', 'action', 'formaction', 'poster',
        'background', 'cite', 'data', 'ping', 'longdesc',
    ];

    /** Ссылка начинается со схемы: "https:", "javascript:", "data:" и подобных. */
    const HAS_SCHEME = /^[a-z][a-z0-9+.\-]*:/i;

    /** Схемы, которые разрешено подставлять в href и src. */
    const ALLOWED_SCHEME = /^(https?|mailto|tel):/i;

    /**
     * Проверяет, что ссылка не является исполняемой (javascript:, data: и т. п.).
     * Небезопасная ссылка не подставляется вовсе — лучше нерабочая картинка,
     * чем выполненный чужой код.
     *
     * Относительные ссылки («city.html?id=…», «/about», «#cities») разрешены:
     * схемы у них нет, выполнить их нельзя. Проверка идёт от обратного — что
     * запрещено, а не что разрешено, — иначе легко забыть очередную форму
     * записи обычного пути и сломать навигацию.
     */
    function safeUrl(value) {
        if (typeof value !== 'string') return null;

        // Управляющие символы внутри схемы браузер игнорирует: "java\tscript:alert(1)"
        // выполнится, хотя на строку не похоже. Убираем их до проверки.
        const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
        if (!cleaned) return null;

        if (HAS_SCHEME.test(cleaned)) {
            return ALLOWED_SCHEME.test(cleaned) ? cleaned : null;
        }

        // «//чужой-домен/x» схемы не содержит, но ведёт наружу и подставляет
        // содержимое с произвольного сайта. Кода это не выполняет, но и
        // относительным путём не является — в проекте такие ссылки не нужны.
        if (cleaned.startsWith('//')) return null;

        return cleaned; // относительный путь или якорь
    }

    /**
     * Создаёт элемент.
     *
     * @param {string} tag
     * @param {Object} [options]
     *   class    — строка классов
     *   text     — текстовое содержимое (через textContent, не через разметку)
     *   attrs    — атрибуты; href и src проходят проверку схемы
     *   dataset  — data-атрибуты
     *   on       — обработчики событий, как функции, а не как строки в атрибутах
     * @param {Array<Node|string>} [children]
     */
    function el(tag, options, children) {
        const node = document.createElement(tag);
        const opts = options || {};

        if (opts.class) node.className = opts.class;

        // textContent, а не innerHTML: содержимое никогда не разбирается как разметка.
        if (opts.text !== undefined && opts.text !== null) {
            node.textContent = String(opts.text);
        }

        if (opts.attrs) {
            Object.keys(opts.attrs).forEach(function (name) {
                const value = opts.attrs[name];
                if (value === undefined || value === null || value === false) return;

                // Обработчики событий через атрибуты — это исполняемая строка. Запрещено.
                if (DANGEROUS_ATTR.test(name)) {
                    console.warn('NF.dom: атрибут отклонён как небезопасный:', name);
                    return;
                }

                if (URL_ATTR.indexOf(name.toLowerCase()) !== -1) {
                    const url = safeUrl(value);
                    if (url === null) {
                        console.warn('NF.dom: ссылка отклонена как небезопасная:', name, value);
                        return;
                    }
                    node.setAttribute(name, url);
                    return;
                }

                node.setAttribute(name, String(value));
            });
        }

        if (opts.dataset) {
            Object.keys(opts.dataset).forEach(function (key) {
                node.dataset[key] = String(opts.dataset[key]);
            });
        }

        if (opts.on) {
            Object.keys(opts.on).forEach(function (event) {
                node.addEventListener(event, opts.on[event]);
            });
        }

        append(node, children);
        return node;
    }

    /** Добавляет детей, пропуская пустые значения. Строка становится текстовым узлом. */
    function append(parent, children) {
        if (!children) return parent;
        const list = Array.isArray(children) ? children : [children];
        list.forEach(function (child) {
            if (child === null || child === undefined || child === false) return;
            parent.append(child); // строка добавляется как текст, не как разметка
        });
        return parent;
    }

    /** Очищает узел. */
    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
        return node;
    }

    /** Заменяет содержимое узла. */
    function replace(node, children) {
        clear(node);
        return append(node, children);
    }

    /** Значение или прочерк — чтобы в интерфейсе не появлялось «undefined». */
    function value(raw, fallback) {
        if (raw === null || raw === undefined) return fallback === undefined ? '—' : fallback;
        const str = String(raw).trim();
        return str === '' ? (fallback === undefined ? '—' : fallback) : str;
    }

    // --- Состояния экрана -------------------------------------------------

    function loading(container, message) {
        replace(container, el('div', { class: 'state' }, [
            el('div', { class: 'spinner' }),
            el('p', { text: message || 'Загружаем…' }),
        ]));
    }

    function empty(container, title, message, link) {
        replace(container, el('div', { class: 'state state-empty' }, [
            el('h3', { text: title }),
            message ? el('p', {}, [message, link || null]) : null,
        ]));
    }

    /**
     * Сообщение об ошибке.
     *
     * Пользователю показывается общая формулировка, технические детали уходят
     * в консоль. Текст ошибки от базы может раскрывать внутренности системы
     * (имена таблиц, устройство запроса) — это подсказка для атакующего.
     */
    function failure(container, userMessage, error) {
        if (error) console.error('Nowhere Fast:', error);
        replace(container, el('div', { class: 'state state-error' }, [
            el('h3', { text: '⚠️ Не удалось загрузить' }),
            el('p', { text: userMessage || 'Попробуй обновить страницу.' }),
        ]));
    }

    /**
     * Картинка с запасным вариантом.
     *
     * Обработчик вешается через addEventListener и снимает сам себя, чтобы
     * недоступная заглушка не вызвала бесконечный цикл переустановки src.
     */
    function image(src, alt, className) {
        const fallback = NF.config.FALLBACK_IMAGE;
        const node = el('img', {
            class: className,
            attrs: { src: safeUrl(src) || fallback, alt: value(alt, ''), loading: 'lazy' },
        });
        node.addEventListener('error', function onError() {
            node.removeEventListener('error', onError);
            node.setAttribute('src', fallback);
        });
        return node;
    }

    return {
        el: el,
        append: append,
        clear: clear,
        replace: replace,
        value: value,
        loading: loading,
        empty: empty,
        failure: failure,
        image: image,
        safeUrl: safeUrl,
    };
})();
