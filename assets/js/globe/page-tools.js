/**
 * Панель инструментов сцены: время, небо, созвездия, север вверх,
 * чип точки отсчёта и нижние счётчики.
 *
 * Всё, что здесь есть, меняет сцену, а не данные. Единственная тонкость —
 * время: сдвиг ползунка обязан перерисовать и карточку, иначе на экране
 * окажутся два противоречащих факта: терминатор уехал, а местное время нет.
 */
window.NF = window.NF || {};

NF.globeTools = (function () {
    'use strict';

    const dom = NF.dom;
    const t = NF.i18n.t;

    const MS_IN_MINUTE = 60000;

    /** Как часто обновляются счётчики: каждый кадр их никто не читает. */
    const METER_EVERY_FRAMES = 20;

    /** Высота Солнца, на которой звёзды гаснут, и ширина перехода. */
    const DAY_FADE_LOW = 0.1;
    const DAY_FADE_SPAN = 0.22;

    /** Откуда взялась точка отсчёта — словами. */
    const ORIGIN_SOURCE = {
        gps: 'globe.originGps',
        zone: 'globe.originZone',
        manual: 'globe.originManual',
    };

    function node(id) { return document.getElementById(id); }

    /**
     * @param {Object} ctx  { globe, format: { coord, minutes }, onTimeChange }
     */
    function create(ctx) {
        const globe = ctx.globe;
        let meterTick = 0;

        // --- Время -----------------------------------------------------------

        function renderTime() {
            const minutes = Number(node('globe-time-range').value);
            globe.setTimeOffset(minutes * MS_IN_MINUTE);
            node('globe-time-value').textContent = minutes === 0
                ? t('globe.now')
                : (minutes > 0 ? '+' : '−') + ctx.format.minutes(Math.abs(minutes));
            ctx.onTimeChange();
        }

        // --- Небо и компас ----------------------------------------------------

        function inSky() {
            return globe.mode === 'sky';
        }

        function renderSky() {
            const button = node('globe-sky');
            // Небо рисуется от точки наблюдателя: без неё смотреть неоткуда.
            button.hidden = !NF.origin.get();
            button.textContent = t(inSky() ? 'globe.orbitView' : 'globe.skyView');
            button.setAttribute('aria-pressed', String(inSky()));
        }

        function setSky(on) {
            globe.setMode(on ? 'sky' : 'orbit');
            document.body.classList.toggle('is-sky', on);
            renderSky();
        }

        /** Стрелка компаса показывает, с какой стороны сейчас смотришь на страну. */
        function renderCompass() {
            const button = node('globe-face-north');
            const focused = Boolean(globe.state.focus) && !inSky();
            button.hidden = !focused;
            if (!focused) return;
            const heading = typeof globe.heading === 'number' ? globe.heading : 0;
            node('globe-compass-arrow').style.transform = 'rotate(' + heading.toFixed(1) + 'deg)';
        }

        // --- Точка отсчёта -----------------------------------------------------

        function renderOrigin() {
            const chip = node('globe-origin-chip');
            const origin = NF.origin.get();

            if (!origin) {
                // Без точки отсчёта половина смысла выключена, поэтому прямо просим.
                dom.replace(chip, [
                    dom.el('span', { class: 'globe-chip__dot' }),
                    dom.el('span', { text: t('globe.originAsk') }),
                    dom.el('span', { class: 'globe-chip__how', text: t('globe.setOrigin') }),
                ]);
                chip.dataset.ask = '1';
            } else {
                globe.setOrigin(origin);
                dom.replace(chip, [
                    dom.el('span', { class: 'globe-chip__dot' }),
                    dom.el('span', { text: t('globe.here') + ': ' +
                        (origin.name || ctx.format.coord(origin.lat, origin.lng)) }),
                    dom.el('span', { class: 'globe-chip__how',
                        text: t(ORIGIN_SOURCE[origin.source] || 'globe.originManual') }),
                ]);
                delete chip.dataset.ask;
            }

            chip.hidden = false;
            renderSky();
        }

        // --- Счётчики -----------------------------------------------------------

        function renderMeters() {
            const stars = NF.globeData.stars();
            const n = NF.i18n.n;
            dom.replace(node('globe-meters'), [
                dom.el('span', { text: String(Math.round(globe.stats.fps)) + ' fps' }),
                dom.el('span', { text: n(stars.count || (stars.named || []).length) +
                    ' ' + t('globe.stars') }),
                dom.el('span', { text: n(NF.globeData.cities().length) + ' ' + t('globe.cities') }),
                dom.el('span', { text: n(NF.globeData.countries().length) + ' ' + t('globe.countries') }),
            ]);
        }

        /** Днём с земли звёзд не видно — гасим их подписи вместе с небом. */
        function daylight() {
            const altitude = globe.state.sunAlt;
            if (!inSky() || typeof altitude !== 'number') return 0;
            return Math.max(0, Math.min(1, (altitude + DAY_FADE_LOW) / DAY_FADE_SPAN));
        }

        /** Вызывается каждый кадр: компас всегда, счётчики — изредка. */
        function tick(labels) {
            renderCompass();
            meterTick += 1;
            if (meterTick % METER_EVERY_FRAMES !== 0) return;
            renderMeters();
            labels.setDaylight(daylight());
        }

        // --- Подписки -------------------------------------------------------------

        function bind() {
            node('globe-time-range').addEventListener('input', renderTime);
            node('globe-time-now').addEventListener('click', function () {
                node('globe-time-range').value = '0';
                renderTime();
            });
            node('globe-sky').addEventListener('click', function () { setSky(!inSky()); });
            node('globe-face-north').addEventListener('click', function () { globe.faceNorth(); });

            const constellations = node('globe-constellations');
            constellations.addEventListener('click', function () {
                const on = constellations.getAttribute('aria-pressed') !== 'true';
                constellations.setAttribute('aria-pressed', String(on));
                globe.setConstellations(on);
            });

            node('globe-origin-chip').addEventListener('click', function () {
                if (node('globe-origin-chip').dataset.ask) {
                    ctx.onAskOrigin();
                    return;
                }
                globe.lookAtOrigin();
            });
        }

        bind();

        return {
            renderTime: renderTime,
            renderOrigin: renderOrigin,
            renderMeters: renderMeters,
            renderSky: renderSky,
            setSky: setSky,
            inSky: inSky,
            tick: tick,
        };
    }

    return { create: create };
})();
