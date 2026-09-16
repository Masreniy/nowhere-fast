/**
 * Карточка выбранного места и список городов продукта.
 *
 * Оба пути внутрь одинаковые по смыслу: человек выбрал точку — и должен
 * увидеть, можно ли туда поехать прямо сейчас. Если у города есть запись
 * в продукте, в карточке появляется переход на city.html. Если записи нет,
 * ссылки нет тоже, и об этом сказано словами: обещать переход в пустоту
 * хуже, чем честно отказать (AC-003).
 */
window.NF = window.NF || {};

NF.globeCard = (function () {
    'use strict';

    const dom = NF.dom;
    const t = NF.i18n.t;

    /** Радиус «что рядом»: у города он меньше, чем у страны целиком. */
    const NEARBY_KM_CITY = 600;
    const NEARBY_KM_COUNTRY = 1200;
    const NEARBY_LIMIT = 6;

    /** Ближе этого расстояния «лететь» не имеет смысла. */
    const SAME_PLACE_KM = 5;

    function node(id) { return document.getElementById(id); }

    /**
     * @param {Object} ctx  { globe, format: { coord, km, minutes, cityHref }, fly }
     */
    function create(ctx) {
        const data = NF.globeData;
        let selection = null;
        let nearby = [];

        // --- Строки статистики --------------------------------------------

        function stat(label, value) {
            return dom.el('div', { class: 'globe-stat' }, [
                dom.el('span', { class: 'globe-stat__label', text: label }),
                dom.el('span', { class: 'globe-stat__value', text: value }),
            ]);
        }

        function stats(city, country) {
            const rows = [];
            if (city && city.population) rows.push(stat(t('globe.population'), NF.i18n.n(city.population)));
            if (country && Number.isFinite(country.land_share)) {
                rows.push(stat(t('globe.share'), (country.land_share * 100).toFixed(2) + ' %'));
            }
            rows.push(stat(t('globe.localTime'), NF.origin.localTime(selection.lng, ctx.globe.date)));
            rows.push(stat(t('globe.center'), ctx.format.coord(selection.lat, selection.lng)));
            return distanceStats().concat(rows);
        }

        function distanceStats() {
            const origin = NF.origin.get();
            if (!origin) return [];
            const km = NF.origin.distanceKm(selection.lat, selection.lng);
            if (km === null) return [];

            // «От тебя 3 204 км» до России из Москвы формально верно, а читается
            // как ошибка: это расстояние до центра страны, где ты и стоишь.
            const inside = selection.kind === 'country' &&
                ctx.globe.countryAt(origin.lat, origin.lng) === selection.index;
            if (inside) return [stat(t('globe.distance'), t('globe.youAreHere'))];
            if (km <= SAME_PLACE_KM) return [];

            return [
                stat(t('globe.distance'), ctx.format.km(km)),
                stat(t('globe.flight'), ctx.format.minutes(NF.origin.flightMinutes(km))),
            ];
        }

        // --- Что рядом ------------------------------------------------------

        function radius() {
            return selection.kind === 'city' ? NEARBY_KM_CITY : NEARBY_KM_COUNTRY;
        }

        function collectNearby() {
            return ctx.globe.citiesNear(selection.lat, selection.lng, radius(), NEARBY_LIMIT)
                .filter(function (item) {
                    return !(selection.kind === 'city' && item.index === selection.index);
                })
                .map(function (item) {
                    const city = data.cityAt(item.index);
                    return {
                        index: item.index, km: item.km,
                        name: city ? city.name : '',
                        lat: city ? city.lat : 0,
                        lng: city ? city.lng : 0,
                    };
                })
                // Справа в строке — километры, значит и порядок строк по километрам.
                .sort(function (a, b) { return a.km - b.km; });
        }

        function renderNearby() {
            // Заголовок без единой строки читается как «не догрузилось».
            const title = nearby.length
                ? t('globe.nearby') + ' · ' + radius() + ' ' + t('globe.km')
                : t('globe.nearbyEmpty');

            const rows = nearby.map(function (item) {
                return dom.el('button', {
                    class: 'globe-nearby__row',
                    attrs: { type: 'button' },
                    on: { click: function () { ctx.globe.selectCity(item.index, ctx.fly()); } },
                }, [
                    dom.el('span', { text: item.name }),
                    dom.el('span', { class: 'globe-nearby__km', text: ctx.format.km(item.km) }),
                ]);
            });

            dom.replace(node('globe-card-nearby'),
                [dom.el('div', { class: 'globe-nearby__title', text: title })].concat(rows));
        }

        // --- Переход в продукт ------------------------------------------------

        function cityLink(row) {
            return dom.el('a', {
                class: 'globe-cta',
                attrs: { href: ctx.format.cityHref(row) },
                text: t('globe.cta'),
            });
        }

        function cityActions(city) {
            const row = data.productAt(selection.index);
            return [
                row
                    ? cityLink(row)
                    // Ссылки туда, где записи нет, быть не должно (AC-003).
                    : dom.el('p', { class: 'globe-card__note', text: t('globe.noCity') }),
                dom.el('button', {
                    class: 'globe-cta globe-cta--ghost',
                    attrs: { type: 'button' },
                    text: t('globe.setOrigin'),
                    on: {
                        click: function () {
                            NF.origin.set({
                                lat: selection.lat, lng: selection.lng,
                                name: city ? city.name : null, source: 'manual',
                            });
                        },
                    },
                }),
            ];
        }

        function countryActions(country) {
            const inCountry = data.productInCountry(country);
            const nodes = [dom.el('p', {
                class: 'globe-card__note',
                text: t(inCountry.length ? 'globe.countryHas' : 'globe.countryEmpty'),
            })];
            inCountry.forEach(function (row) {
                nodes.push(dom.el('a', {
                    class: 'globe-cta',
                    attrs: { href: ctx.format.cityHref(row) },
                    text: row.name,
                }));
            });
            return nodes;
        }

        // --- Карточка целиком --------------------------------------------------

        function render(payload) {
            selection = payload;
            const card = node('globe-card');

            if (!selection) {
                nearby = [];
                card.hidden = true;
                document.body.classList.remove('has-selection');
                return;
            }

            nearby = collectNearby();
            draw();
            card.hidden = false;
            document.body.classList.add('has-selection');
        }

        function draw() {
            const isCity = selection.kind === 'city';
            const city = isCity ? data.cityAt(selection.index) : null;
            const country = isCity ? null : data.countryAtIndex(selection.index);

            node('globe-card-name').textContent = isCity
                ? (city ? city.name : '')
                : data.countryName(selection.index);
            node('globe-card-meta').textContent = isCity
                ? data.countryNameByCode(city ? city.country_code : '')
                : (country ? country.code || '' : '');

            dom.replace(node('globe-card-stats'), stats(city, country));
            renderNearby();
            dom.replace(node('globe-card-actions'),
                isCity ? cityActions(city) : countryActions(country));
        }

        /** Перерисовка без нового выбора: сменились время, язык или точка отсчёта. */
        function refresh() {
            if (selection) draw();
        }

        // --- Список городов продукта --------------------------------------------

        function cityRow(row) {
            const index = data.cityIndexOf(row);
            const actions = [];

            if (index !== undefined) {
                actions.push(dom.el('button', {
                    class: 'globe-cta globe-cta--ghost',
                    attrs: { type: 'button' },
                    text: t('globe.citiesShow'),
                    on: {
                        click: function () {
                            closeList();
                            ctx.globe.selectCity(index, ctx.fly());
                        },
                    },
                }));
            }
            actions.push(cityLink(row));

            return dom.el('div', { class: 'globe-city-row' }, [
                dom.el('div', {}, [
                    dom.el('div', { class: 'globe-city-row__name', text: row.name }),
                    dom.el('div', { class: 'globe-city-row__meta',
                        text: data.countryNameByCode(row.country_code) }),
                ]),
                dom.el('div', { class: 'globe-city-row__actions' }, actions),
            ]);
        }

        function renderList() {
            const list = node('globe-cities-list');
            const rows = data.productCities();
            dom.replace(list, rows.length
                ? rows.map(cityRow)
                : dom.el('p', { class: 'globe-card__note', text: t('globe.citiesEmpty') }));
        }

        function openList() {
            renderList();
            node('globe-cities').hidden = false;
            node('globe-cities-close').focus();
        }

        function closeList() {
            node('globe-cities').hidden = true;
        }

        function listOpen() {
            return !node('globe-cities').hidden;
        }

        function bind() {
            node('globe-card-close').addEventListener('click', function () { ctx.globe.clear(); });
            node('globe-cities-open').addEventListener('click', openList);
            node('globe-cities-close').addEventListener('click', closeList);
            node('globe-cities').addEventListener('click', function (event) {
                if (event.target === node('globe-cities')) closeList();
            });
        }

        bind();

        return {
            render: render,
            refresh: refresh,
            nearby: function () { return nearby; },
            renderList: renderList,
            openList: openList,
            closeList: closeList,
            listOpen: listOpen,
        };
    }

    return { create: create };
})();
