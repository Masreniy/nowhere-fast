/**
 * Страница глобуса — она же первая страница проекта.
 *
 * Здесь только склейка: загрузить справочник, собрать сцену, связать между
 * собой поиск, карточку, панель инструментов и подписи. Сами эти части живут
 * в page-search.js, page-card.js, page-tools.js и page-labels.js — вместе
 * файл переваливал за жёсткий потолок в 800 строк.
 *
 * Глобус здесь не украшение, а вход: человек видит, где он сам и что вокруг,
 * выбирает страну или город глазами — и попадает в сбор поездки. Города,
 * до которых уже можно доехать, отмечены на шаре: иначе непонятно, что тут
 * вообще можно сделать.
 */
window.NF = window.NF || {};

(function () {
    'use strict';

    const dom = NF.dom;
    const t = NF.i18n.t;

    /** Снимок поверхности и карта рельефа. Единственное место, где они названы. */
    const TEXTURES = {
        earth: 'assets/img/globe/earth.jpg',
        surface: 'assets/img/globe/surface.jpg',
    };

    /** Города справочника мельче этого населения на глобусе только шумят. */
    const MIN_CITY_POPULATION = 50000;

    /** Сколько городов выбранной страны подписывать на шаре. */
    const OWN_CITIES_LIMIT = 8;

    const MINUTES_IN_HOUR = 60;

    let globe = null;
    let labels = null;
    let card = null;
    let tools = null;
    let finder = null;

    let selection = null;
    let countryCities = [];
    let pins = [];
    let fatalKeys = null;

    function node(id) { return document.getElementById(id); }

    /** Перелёты камеры — движение, от которого человек мог отказаться. */
    function fly() {
        return !(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // --- Форматирование ----------------------------------------------------

    /**
     * Стороны света буквами N/S/E/W намеренно не переводятся: это обозначения
     * на картах, одинаковые в любом языке интерфейса.
     */
    function coordText(lat, lng) {
        return Math.abs(lat).toFixed(1) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' +
            Math.abs(lng).toFixed(1) + '° ' + (lng >= 0 ? 'E' : 'W');
    }

    function kmText(km) {
        return NF.i18n.n(Math.round(km)) + ' ' + t('globe.km');
    }

    function minutesText(total) {
        const minutes = Math.round(total);
        if (minutes < MINUTES_IN_HOUR) return t('unit.minutes', { n: minutes });
        const hours = Math.floor(minutes / MINUTES_IN_HOUR);
        const rest = minutes % MINUTES_IN_HOUR;
        return t('unit.hours', { n: hours }) +
            (rest ? ' ' + t('unit.minutes', { n: rest }) : '');
    }

    function cityHref(row) {
        return 'city.html?id=' + encodeURIComponent(row.id);
    }

    const FORMAT = { coord: coordText, km: kmText, minutes: minutesText, cityHref: cityHref };

    // --- Заставка и экран отказа -------------------------------------------

    function hideBoot() {
        const boot = node('globe-boot');
        if (boot) boot.remove();
    }

    /**
     * Отказ вместо чёрного экрана.
     *
     * Заставка снимается первой: в прототипе исключение в конструкторе сцены
     * обрывало остальной модуль, и человек оставался с вечной полоской
     * загрузки, без единого слова о том, что случилось (AC-002).
     */
    function showFatal(titleKey, hintKey, error) {
        fatalKeys = { title: titleKey, hint: hintKey };
        hideBoot();
        // Списка городов без сцены нет — но ссылки на них есть прямо здесь.
        node('globe-cities-open').hidden = true;
        renderFatal();
        node('globe-fatal').hidden = false;
        if (error) console.error('Nowhere Fast:', error);
    }

    function renderFatal() {
        if (!fatalKeys) return;
        node('globe-fatal-title').textContent = t(fatalKeys.title);
        node('globe-fatal-hint').textContent = t(fatalKeys.hint);

        // Сцены нет, а города продукта никуда не делись: это единственный
        // работающий путь дальше. Данные не успели прийти — ссылок не будет.
        const rows = NF.globeData.productCities();
        const links = rows.map(function (row) {
            return dom.el('a', { class: 'globe-cta', attrs: { href: cityHref(row) }, text: row.name });
        });
        dom.replace(node('globe-fatal-extra'), links.length
            ? [dom.el('p', { class: 'globe-card__note', text: t('globe.fatalCities') })].concat(links)
            : null);
    }

    function webglAvailable() {
        try {
            const probe = document.createElement('canvas');
            return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
        } catch (error) {
            return false;
        }
    }

    // --- Отметки городов продукта ------------------------------------------

    function buildPins() {
        pins = NF.globeData.marks().map(function (mark) {
            return {
                key: mark.row.id,
                title: mark.row.name,
                cityIndex: mark.cityIndex,
                lat: mark.lat,
                lng: mark.lng,
                hint: t('globe.inProduct'),
                onPick: function () { openMark(mark); },
            };
        });
    }

    /**
     * Клик по отметке. Если у города есть двойник в справочнике, показываем
     * его на шаре: переход в продукт человек сделает сам из карточки.
     * Двойника нет — вести некуда, кроме самой страницы города.
     */
    function openMark(mark) {
        if (mark.cityIndex === undefined) {
            window.location.href = cityHref(mark.row);
            return;
        }
        card.closeList();
        globe.selectCity(mark.cityIndex, fly());
    }

    // --- Выбор на сцене ------------------------------------------------------

    function onSelect(payload) {
        selection = payload;
        countryCities = [];

        if (payload) {
            const countryIndex = NF.globeData.countryIndexOf(payload);
            if (countryIndex >= 0) {
                countryCities = globe.citiesInCountry(countryIndex, OWN_CITIES_LIMIT)
                    .map(function (item) {
                        const city = NF.globeData.cityAt(item.index);
                        return {
                            index: item.index,
                            name: city ? city.name : '',
                            lat: city ? city.lat : 0,
                            lng: city ? city.lng : 0,
                        };
                    });
            }
        }

        card.render(payload);
    }

    function onPickFound(row) {
        // В режиме неба полёт камеры не виден: сперва возвращаемся на орбиту.
        if (tools.inSky()) tools.setSky(false);
        if (row.kind === 'city') globe.selectCity(row.index, fly());
        else globe.selectCountry(row.index, fly());
    }

    // --- Кадр ------------------------------------------------------------------

    function starName(star) {
        const names = star.names || {};
        return names[NF.i18n.lang()] || names.en || '';
    }

    function selectionTitle() {
        if (!selection) return '';
        if (selection.kind !== 'city') return NF.globeData.countryName(selection.index);
        const city = NF.globeData.cityAt(selection.index);
        return city ? city.name : '';
    }

    function labelView() {
        return {
            globe: globe,
            pins: pins,
            selection: selection,
            title: selectionTitle(),
            nearby: card.nearby(),
            countryCities: countryCities,
            stars: NF.globeData.stars().named || [],
            starName: starName,
            text: { here: t('globe.here'), sun: t('globe.sun'), moon: t('globe.moon') },
        };
    }

    function frame() {
        window.requestAnimationFrame(frame);
        labels.update(labelView());
        tools.tick(labels);
    }

    // --- Клавиатура --------------------------------------------------------------

    function bindKeyboard() {
        document.addEventListener('keydown', function (event) {
            if (event.key === '/' && !finder.hasFocus()) {
                event.preventDefault();
                finder.focus();
                return;
            }
            if (event.key !== 'Escape') return;

            // Порядок важен: подсказка обещает «esc — сброс», и выйти из неба
            // без мыши иначе было бы нельзя.
            if (card.listOpen()) card.closeList();
            else if (tools.inSky()) tools.setSky(false);
            else globe.clear();
        });
    }

    // --- Смена языка ---------------------------------------------------------------

    /** Разметку NF.i18n перевёл сам; здесь — то, что нарисовано из кода. */
    function onLanguageChange() {
        renderFatal();
        if (!globe) return;

        NF.globeData.rebuildSearch();
        buildPins();
        labels.reset();
        finder.refresh();
        tools.renderOrigin();
        tools.renderTime();
        tools.renderMeters();
        card.refresh();
        card.renderList();
    }

    // --- Запуск -----------------------------------------------------------------------

    async function init() {
        NF.i18n.apply(document);
        NF.i18n.mountSwitcher(node('lang-switcher'));
        NF.i18n.onChange(onLanguageChange);

        // С file:// браузер не даёт прочитать пиксели соседней картинки, и
        // сцена гарантированно останется чёрной. Честнее сказать это сразу,
        // чем показывать вечную заставку (ADR-0008).
        if (window.location.protocol === 'file:') {
            showFatal('globe.fileTitle', 'globe.fileHint', null);
            return;
        }

        try {
            await NF.globeData.load(MIN_CITY_POPULATION);
        } catch (error) {
            showFatal('globe.dataTitle', 'globe.dataHint', error);
            return;
        }

        if (!webglAvailable()) {
            showFatal('globe.noWebgl', 'globe.noWebglHint', null);
            return;
        }

        try {
            globe = NF.globe.create(node('globe-scene'), {
                countries: NF.globeData.countries(),
                cities: NF.globeData.cities(),
                stars: NF.globeData.stars(),
                textures: TEXTURES,
            });
        } catch (error) {
            showFatal('globe.noWebgl', 'globe.noWebglHint', error);
            return;
        }

        start();
    }

    function start() {
        const ctx = {
            globe: globe,
            format: FORMAT,
            fly: fly,
            onTimeChange: function () { card.refresh(); },
            onAskOrigin: function () { finder.focus(); },
            onPick: onPickFound,
        };

        labels = NF.globeLabels.create(node('globe-labels'));
        card = NF.globeCard.create(ctx);
        tools = NF.globeTools.create(ctx);
        finder = NF.globeSearch.create(ctx);

        buildPins();
        bindKeyboard();
        globe.onSelect(onSelect);
        NF.origin.onChange(function () {
            tools.renderOrigin();
            card.refresh();
        });

        tools.renderOrigin();
        tools.renderTime();
        tools.renderMeters();
        card.renderList();
        detectOrigin();

        hideBoot();
        frame();
    }

    /** Геолокация — только по явному разрешению браузера, и молча без неё. */
    function detectOrigin() {
        if (NF.origin.get()) return;
        const detecting = NF.origin.detect();
        if (detecting && typeof detecting.catch === 'function') {
            detecting.catch(function (error) {
                console.error('Nowhere Fast:', error);
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
