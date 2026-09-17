/**
 * Язык интерфейса — свойство всего проекта.
 *
 * Зачем этот файл существует. Страницы были написаны по-русски прямо в разметке
 * и прямо в строковых литералах внутри скриптов. Планировщик путешествий,
 * который разговаривает только на одном языке, отсекает ровно ту аудиторию,
 * ради которой он задуман: человека, который едет в чужую страну.
 *
 * Язык здесь не настройка страницы, а настройка проекта: он живёт в одном
 * ключе локального хранилища, применяется ко всем страницам и переживает
 * переход по ссылке. Выбранный на главной, он остаётся выбранным в плане.
 *
 * Разметка переводится декларативно, без сборки шаблонов:
 *
 *     <h1 data-i18n="hero.titleA"></h1>
 *     <input data-i18n-attr="placeholder:search.hint, title:search.title" />
 *
 * Текст всегда попадает в документ через textContent, атрибуты — через
 * setAttribute. Ни одной сборки разметки строкой здесь нет и быть не может
 * (.claude/rules/security.md, правило 2).
 *
 * Словари лежат отдельно, в assets/js/i18n-strings.js: с десятью языками они
 * не помещаются в этот файл, не пробив потолок в 800 строк. Здесь — только
 * механика. Порядок подключения: сначала dom.js, потом i18n-strings.js,
 * потом этот файл.
 */
window.NF = window.NF || {};

NF.i18n = (function () {
    'use strict';

    /** Ключ в локальном хранилище. Один на весь проект — в этом и смысл. */
    const STORAGE_KEY = 'nf.lang';

    /**
     * Язык оригинала. На нём написаны все исходные тексты проекта, поэтому
     * он же последняя ступень запасного пути: лучше показать русскую строку,
     * чем голый ключ вида «plan.emptyTitle».
     */
    const SOURCE_LANG = 'ru';

    /** Предпоследняя ступень: английский понимают шире русского. */
    const BRIDGE_LANG = 'en';

    /**
     * Десять языков. Порядок — порядок пунктов в переключателе.
     *
     * Подпись каждого языка написана на нём самом: человек, который не читает
     * по-русски, не найдёт себя в списке, где написано «Арабский».
     */
    const LANGS = [
        { code: 'ru', label: 'Русский', dir: 'ltr' },
        { code: 'en', label: 'English', dir: 'ltr' },
        { code: 'zh', label: '中文', dir: 'ltr' },
        { code: 'es', label: 'Español', dir: 'ltr' },
        { code: 'ar', label: 'العربية', dir: 'rtl' },
        { code: 'hi', label: 'हिन्दी', dir: 'ltr' },
        { code: 'pt', label: 'Português', dir: 'ltr' },
        { code: 'fr', label: 'Français', dir: 'ltr' },
        { code: 'de', label: 'Deutsch', dir: 'ltr' },
        { code: 'ja', label: '日本語', dir: 'ltr' },
    ];

    /** Ключи, о пропаже которых уже сказано. Второй раз молчим: иначе консоль зальёт. */
    const warned = Object.create(null);

    const listeners = [];

    let current = SOURCE_LANG;

    // --- Словарь -----------------------------------------------------------

    /**
     * Словари читаются при каждом обращении, а не один раз при загрузке.
     *
     * Так порядок подключения тегов перестаёт быть ловушкой: если
     * i18n-strings.js окажется ниже по странице, модуль не запомнит пустоту
     * навсегда, а увидит словарь, как только тот появится.
     */
    function dict() {
        return (window.NF && NF.i18nStrings) || {};
    }

    function known(code) {
        return LANGS.some(function (item) { return item.code === code; });
    }

    function info(code) {
        for (let i = 0; i < LANGS.length; i += 1) {
            if (LANGS[i].code === code) return LANGS[i];
        }
        return LANGS[0];
    }

    // --- Хранилище ---------------------------------------------------------

    /**
     * Хранилище может быть недоступно: приватное окно, запрет данных сайта,
     * открытие файла с диска. Это не ошибка приложения — работаем без него,
     * просто язык не переживёт перезагрузку. Так же сделано в trip.js.
     */
    function readStored() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }
    }

    function writeStored(code) {
        try {
            window.localStorage.setItem(STORAGE_KEY, code);
            return true;
        } catch (error) {
            return false;
        }
    }

    // --- Выбор языка при первом заходе -------------------------------------

    /**
     * Что показать человеку, который здесь впервые.
     *
     * Сохранённый выбор старше языка браузера: если человек однажды переключил
     * язык руками, менять его за него нельзя. Из navigator берётся только
     * основная часть метки — «pt-BR» и «pt-PT» для нас один португальский.
     */
    function detect() {
        const stored = readStored();
        if (known(stored)) return stored;

        const wanted = [];
        if (window.navigator) {
            if (Array.isArray(navigator.languages)) wanted.push.apply(wanted, navigator.languages);
            if (navigator.language) wanted.push(navigator.language);
        }

        for (let i = 0; i < wanted.length; i += 1) {
            const code = String(wanted[i]).toLowerCase().split('-')[0];
            if (known(code)) return code;
        }

        return SOURCE_LANG;
    }

    // --- Перевод -----------------------------------------------------------

    /**
     * Строка из строки словаря.
     *
     * Если на текущем языке её нет, берётся английская, потом русская.
     * Молчаливо: недопереведённый ключ — это не то же самое, что ключ,
     * которого нет вовсе, и орать о нём на каждой отрисовке бесполезно.
     * О полностью пропавшем ключе говорит t().
     */
    function pick(row) {
        if (!row || typeof row !== 'object') return null;
        if (typeof row[current] === 'string') return row[current];
        if (typeof row[BRIDGE_LANG] === 'string') return row[BRIDGE_LANG];
        if (typeof row[SOURCE_LANG] === 'string') return row[SOURCE_LANG];
        return null;
    }

    /**
     * Форма множественного числа для текущего языка.
     *
     * Своей таблицы здесь нет намеренно: «5 мест», «5 places» и «٥ أماكن»
     * выбираются по разным правилам, и в браузере эти правила уже есть.
     * Запасной вариант на случай отсутствия Intl.PluralRules — английский:
     * он даёт хотя бы верную единственную форму.
     */
    function pluralCategory(count) {
        try {
            return new Intl.PluralRules(current).select(count);
        } catch (error) {
            return count === 1 ? 'one' : 'other';
        }
    }

    /**
     * Ищет строку: сначала форму числа, потом ключ как есть.
     *
     * Строка «ключ.one» существует не у всех ключей и не у всех языков —
     * поэтому ключ без суффикса остаётся обязательным и работает сеткой
     * безопасности для форм, которых мы не предусмотрели (у арабского
     * их шесть).
     */
    function lookup(key, vars) {
        const all = dict();

        if (vars && typeof vars.n === 'number' && Number.isFinite(vars.n)) {
            const byCount = pick(all[key + '.' + pluralCategory(vars.n)]);
            if (byCount !== null) return byCount;
        }

        return pick(all[key]);
    }

    /** Подставляет значения: «{n} мин» + { n: 90 } → «90 мин». */
    function format(text, vars) {
        if (!vars) return text;
        return text.replace(/\{(\w+)\}/g, function (whole, name) {
            if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
            const value = vars[name];
            return typeof value === 'number' ? n(value) : String(value);
        });
    }

    /**
     * Перевод ключа. Второй аргумент необязателен и подставляет значения.
     *
     * Пропавший ключ возвращает сам себя и один раз пишет в консоль. Молча
     * подставить пустую строку нельзя: пустое место в интерфейсе выглядит
     * как задуманное и живёт годами, а «plan.emptyTitle» на экране видно сразу.
     */
    function t(key, vars) {
        const found = lookup(key, vars);

        if (found === null) {
            if (!warned[key]) {
                warned[key] = true;
                console.warn('NF.i18n: нет строки для ключа:', key);
            }
            return key;
        }

        return format(found, vars);
    }

    /** Число по правилам языка: 1234 → «1 234» или «1,234». */
    function n(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return String(value);
        try {
            return new Intl.NumberFormat(current).format(num);
        } catch (error) {
            return String(num);
        }
    }

    // --- Разметка ----------------------------------------------------------

    /** Узлы с атрибутом, включая сам корень: apply(node) должен переводить и node. */
    function nodesWith(root, attribute) {
        const scope = root || document;
        const found = Array.prototype.slice.call(
            scope.querySelectorAll('[' + attribute + ']'));
        if (scope.nodeType === 1 && scope.hasAttribute(attribute)) found.unshift(scope);
        return found;
    }

    /**
     * Разбирает «placeholder:search.hint, title:search.title».
     * Пара без двоеточия — опечатка, о ней говорим вслух, а не глотаем.
     */
    function applyAttrs(node, spec) {
        spec.split(',').forEach(function (pair) {
            const at = pair.indexOf(':');
            if (at === -1) {
                console.warn('NF.i18n: не разобрана пара «атрибут:ключ»:', pair);
                return;
            }

            const name = pair.slice(0, at).trim();
            const key = pair.slice(at + 1).trim();
            if (!name || !key) return;

            // Обработчики событий через атрибуты — исполняемая строка.
            // Словарь наш, но запрет держится списком, а не доверием.
            if (/^on/i.test(name)) {
                console.warn('NF.i18n: атрибут отклонён как небезопасный:', name);
                return;
            }

            node.setAttribute(name, t(key));
        });
    }

    /** Переводит поддерево. Без аргумента — весь документ. */
    function apply(root) {
        nodesWith(root, 'data-i18n').forEach(function (node) {
            node.textContent = t(node.getAttribute('data-i18n'));
        });

        nodesWith(root, 'data-i18n-attr').forEach(function (node) {
            applyAttrs(node, node.getAttribute('data-i18n-attr'));
        });

        return root || document;
    }

    // --- Смена языка -------------------------------------------------------

    /**
     * Направление письма — свойство документа, а не отдельного блока.
     * Арабский переворачивает всю страницу целиком, включая порядок колонок
     * и сторону, с которой начинается текст.
     */
    function reflect() {
        if (!window.document || !document.documentElement) return;
        document.documentElement.setAttribute('lang', current);
        document.documentElement.setAttribute('dir', info(current).dir);
    }

    function set(code) {
        const next = String(code || '').toLowerCase();

        if (!known(next)) {
            console.warn('NF.i18n: неизвестный язык:', code);
            return false;
        }

        current = next;
        writeStored(next);
        reflect();
        apply(document);

        // Копия списка: подписчик вправе отписаться прямо в обработчике,
        // и правка массива на ходу пропустила бы следующего за ним.
        listeners.slice().forEach(function (fn) {
            try {
                fn(next);
            } catch (error) {
                console.error('Nowhere Fast: подписчик языка упал:', error);
            }
        });

        return true;
    }

    function lang() {
        return current;
    }

    /** Подписка на смену языка. Возвращает функцию отписки. */
    function onChange(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () {
            const at = listeners.indexOf(fn);
            if (at !== -1) listeners.splice(at, 1);
        };
    }

    // --- Переключатель -----------------------------------------------------

    /**
     * Переключатель языка в указанный узел.
     *
     * Обычный select, а не своё выпадающее меню: на телефоне он открывается
     * родным списком системы, читается экранной читалкой и работает
     * с клавиатуры без единой строки кода с нашей стороны.
     */
    function mountSwitcher(target) {
        if (!target) {
            console.warn('NF.i18n: переключатель некуда поставить');
            return null;
        }

        const select = NF.dom.el('select', {
            class: 'lang-select',
            attrs: { 'data-i18n-attr': 'aria-label:lang.label' },
        }, LANGS.map(function (item) {
            return NF.dom.el('option', { attrs: { value: item.code }, text: item.label });
        }));

        select.value = current;
        select.addEventListener('change', function () { set(select.value); });

        target.classList.add('lang-switcher');
        NF.dom.replace(target, select);
        apply(select);

        // Переключателей на странице может быть несколько, а язык мог смениться
        // и вовсе не через них — тогда выбранный пункт обязан догнать состояние.
        onChange(function (code) { select.value = code; });

        return select;
    }

    // --- Запуск ------------------------------------------------------------

    current = detect();
    reflect();

    return {
        LANGS: LANGS,
        lang: lang,
        set: set,
        t: t,
        n: n,
        onChange: onChange,
        apply: apply,
        mountSwitcher: mountSwitcher,
        STORAGE_KEY: STORAGE_KEY,
    };
})();
