/**
 * Справочник глобуса и его связь с продуктом.
 *
 * Здесь лежит всё, что страница знает о странах и городах: загрузка через
 * NF.api, названия на текущем языке, поиск и — главное — сопоставление города
 * справочника с городом, который уже есть в продукте. Именно от этого
 * сопоставления зависит, появится ли в карточке переход на city.html (AC-003).
 *
 * Отдельный файл, потому что вместе с интерфейсом page.js перевалил за
 * жёсткий потолок в 800 строк. Шов проходит по смыслу: здесь данные,
 * там экран.
 */
window.NF = window.NF || {};

NF.globeData = (function () {
    'use strict';

    /**
     * Насколько далеко город продукта может отстоять от одноимённого города
     * справочника, в градусах.
     *
     * Одного имени мало: Кембридж есть и в Англии, и в США (открытый пункт 8
     * в CLAUDE.md). Рамка по координатам, а не расстояние, — чтобы не заводить
     * вторую формулу гаверсинуса рядом с той, что уже живёт в NF.origin.
     */
    const CITY_MATCH_DEGREES = 1;

    /** Город продукта в поиске стоит первым, а не тонет среди тёзок. */
    const PRODUCT_WEIGHT = 1e9;

    let countries = [];
    let cities = [];
    let productCities = [];

    /**
     * Написания городов на текущем языке: geoname_id → имя.
     *
     * Приезжают отдельно и ПОСЛЕ первого кадра. Справочник городов приходит
     * латиницей, и этого достаточно, чтобы страница ожила; написания —
     * улучшение поверх, а не условие работы. Если они не доедут вовсе,
     * всё останется латиницей и ничего не сломается.
     */
    let localNames = {};

    let countryIndexByCode = {};
    let productByCityIndex = {};
    let cityIndexByProductId = {};
    let searchIndex = [];

    // --- Загрузка ---------------------------------------------------------

    async function load(minPopulation) {
        const answer = await Promise.all([
            NF.api.listCountries(),
            NF.api.listGeoCities(minPopulation),
            NF.api.listCitiesWithContent(),
        ]);
        countries = answer[0] || [];
        cities = answer[1] || [];
        productCities = answer[2] || [];

        countryIndexByCode = {};
        countries.forEach(function (country, index) {
            if (country.code) countryIndexByCode[country.code] = index;
        });

        linkProduct();
        buildSearchIndex();
    }

    /** Звёзды приходят файлом-артефактом, а не из базы: они не меняются. */
    function stars() {
        return NF.globeStars || { named: [], count: 0 };
    }

    // --- Названия ---------------------------------------------------------

    function countryName(index) {
        const country = countries[index];
        if (!country) return '';
        const names = country.names || {};
        return names[NF.i18n.lang()] || names.en || country.code || '';
    }

    function countryNameByCode(code) {
        const index = countryIndexByCode[code];
        return index === undefined ? (code || '') : countryName(index);
    }

    function cityAt(index) {
        return cities[index] || null;
    }

    /**
     * Имя города на языке интерфейса — или латиницей, если написания нет.
     *
     * Единственное место, где город превращается в текст. Раньше страница
     * брала `city.name` напрямую в семи местах, и добавить язык значило бы
     * не забыть ни одного из семи.
     */
    function cityName(index) {
        const city = cities[index];
        if (!city) return '';
        return localNames[city.geoname_id] || city.name || '';
    }

    /**
     * Догружает написания на один язык и перестраивает поиск.
     *
     * Ошибку не бросает наверх: не доехали написания — страница работает
     * латиницей. Ронять из-за этого уже отрисованный глобус нельзя.
     */
    async function loadCityNames(lang) {
        try {
            const rows = await NF.api.listCityNames(lang);
            const next = {};
            rows.forEach(function (row) {
                if (row && row.local_name) next[row.geoname_id] = row.local_name;
            });
            localNames = next;
            buildSearchIndex();
            return rows.length;
        } catch (error) {
            console.error('написания городов не загрузились', error);
            return 0;
        }
    }

    function countryAtIndex(index) {
        return countries[index] || null;
    }

    /** Индекс страны для выбора на сцене: у города он бывает не задан. */
    function countryIndexOf(payload) {
        if (payload.kind === 'country') return payload.index;
        if (typeof payload.country === 'number') return payload.country;
        const city = cityAt(payload.index);
        const found = city ? countryIndexByCode[city.country_code] : undefined;
        return found === undefined ? -1 : found;
    }

    // --- Связь с продуктом -------------------------------------------------

    function sameSpot(row, city) {
        if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return true;
        return Math.abs(row.lat - city.lat) <= CITY_MATCH_DEGREES &&
            Math.abs(row.lng - city.lng) <= CITY_MATCH_DEGREES;
    }

    function matchProduct(city) {
        const name = String(city.name || '').trim().toLowerCase();
        for (let i = 0; i < productCities.length; i++) {
            const row = productCities[i];
            if (String(row.name || '').trim().toLowerCase() !== name) continue;
            if (!sameSpot(row, city)) continue;
            return row;
        }
        return null;
    }

    function linkProduct() {
        productByCityIndex = {};
        cityIndexByProductId = {};
        cities.forEach(function (city, index) {
            const row = matchProduct(city);
            if (!row || cityIndexByProductId[row.id] !== undefined) return;
            productByCityIndex[index] = row;
            cityIndexByProductId[row.id] = index;
        });
    }

    /** Запись продукта для города справочника — или null, если её нет. */
    function productAt(cityIndex) {
        return productByCityIndex[cityIndex] || null;
    }

    /** Город справочника для записи продукта — или undefined, если двойника нет. */
    function cityIndexOf(row) {
        return cityIndexByProductId[row.id];
    }

    function productInCountry(country) {
        if (!country) return [];
        return productCities.filter(function (row) {
            return row.country_code && row.country_code === country.code;
        });
    }

    /**
     * Отметки городов продукта на шаре.
     *
     * Без них лендинг выглядит пустым: город в продукте сейчас один, и найти
     * его глазами среди тысяч точек невозможно. Координаты берём из продукта,
     * а если их там нет — у двойника из справочника.
     */
    function marks() {
        const list = [];
        productCities.forEach(function (row) {
            const index = cityIndexOf(row);
            const twin = index === undefined ? null : cityAt(index);
            const lat = Number.isFinite(row.lat) ? row.lat : (twin ? twin.lat : null);
            const lng = Number.isFinite(row.lng) ? row.lng : (twin ? twin.lng : null);
            if (lat === null || lng === null) return;
            list.push({ row: row, cityIndex: index, lat: lat, lng: lng });
        });
        return list;
    }

    // --- Поиск --------------------------------------------------------------

    function buildSearchIndex() {
        searchIndex = [];

        countries.forEach(function (country, index) {
            // Право быть найденной даёт наличие координат, а не размер страны:
            // в прототипе отбор по площади выбрасывал Мальту и Науру.
            if (!Number.isFinite(country.lat) || !Number.isFinite(country.lng)) return;
            const title = countryName(index);
            const english = (country.names && country.names.en) || '';
            searchIndex.push({
                kind: 'country', index: index, title: title, meta: country.code || '',
                key: title.toLowerCase(),
                alt: english.toLowerCase(),
                weight: (country.land_share || 0) + 1,
                inProduct: productInCountry(country).length > 0,
            });
        });

        cities.forEach(function (city, index) {
            const inProduct = Boolean(productByCityIndex[index]);
            const local = localNames[city.geoname_id] || '';
            // Два написания лежат раздельно, а не склеенными в одну строку:
            // «Париж» и «Paris» обязаны находить один город, но склейка
            // сдвинула бы позицию совпадения и сломала бы порядок выдачи —
            // «paris» нашёлся бы в середине ключа и уехал вниз.
            searchIndex.push({
                kind: 'city', index: index, title: local || city.name || '',
                meta: countryNameByCode(city.country_code),
                key: String(local || city.name || '').toLowerCase(),
                alt: local ? String(city.name || '').toLowerCase() : '',
                weight: (city.population || 0) + (inProduct ? PRODUCT_WEIGHT : 0),
                inProduct: inProduct,
            });
        });
    }

    /**
     * Где в строке нашлось совпадение, считая и второе написание.
     * -1, если не нашлось нигде.
     */
    function matchAt(row, needle) {
        const inKey = row.key.indexOf(needle);
        const inAlt = row.alt ? row.alt.indexOf(needle) : -1;
        if (inKey === -1) return inAlt;
        if (inAlt === -1) return inKey;
        return Math.min(inKey, inAlt);
    }

    function search(query, limit) {
        const needle = String(query || '').trim().toLowerCase();
        if (!needle) return [];
        return searchIndex.map(function (row) {
            return { row: row, at: matchAt(row, needle) };
        }).filter(function (hit) {
            return hit.at !== -1;
        }).sort(function (a, b) {
            // Совпадение в начале имени важнее веса: на «пар» ждут Париж.
            if (a.at !== b.at) return a.at - b.at;
            return b.row.weight - a.row.weight;
        }).slice(0, limit).map(function (hit) {
            return hit.row;
        });
    }

    return {
        load: load,
        stars: stars,
        countries: function () { return countries; },
        cities: function () { return cities; },
        productCities: function () { return productCities; },
        countryName: countryName,
        countryNameByCode: countryNameByCode,
        countryAtIndex: countryAtIndex,
        countryIndexOf: countryIndexOf,
        cityAt: cityAt,
        cityName: cityName,
        loadCityNames: loadCityNames,
        productAt: productAt,
        cityIndexOf: cityIndexOf,
        productInCountry: productInCountry,
        marks: marks,
        rebuildSearch: buildSearchIndex,
        search: search,
    };
})();
