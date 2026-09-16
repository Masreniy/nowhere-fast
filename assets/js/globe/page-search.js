/**
 * Поиск по странам и городам и его выпадающий список.
 *
 * Отбор и вес живут в NF.globeData — здесь только экран и клавиатура:
 * стрелки ходят по результатам, Enter выбирает, Escape закрывает список.
 * Город, до которого уже можно доехать, помечен точкой: на лендинге это
 * единственная подсказка, что выбор ведёт не в пустоту.
 */
window.NF = window.NF || {};

NF.globeSearch = (function () {
    'use strict';

    const dom = NF.dom;
    const t = NF.i18n.t;

    /** Больше семи строк в выпадающем списке уже не выбирают, а листают. */
    const LIMIT = 7;

    /**
     * @param {Object} ctx  { onPick(row) }
     */
    function create(ctx) {
        const input = document.getElementById('globe-search-input');
        const box = document.getElementById('globe-search-results');

        let results = [];
        let cursor = -1;

        function render(list) {
            results = list;
            cursor = list.length ? 0 : -1;

            dom.replace(box, list.map(function (row, i) {
                return dom.el('button', {
                    class: 'globe-result' + (i === 0 ? ' is-active' : '') +
                        (row.inProduct ? ' is-product' : ''),
                    attrs: {
                        type: 'button',
                        role: 'option',
                        title: row.inProduct ? t('globe.inProduct') : null,
                    },
                    on: { click: function () { choose(row); } },
                }, [
                    dom.el('span', { text: row.title }),
                    dom.el('span', { class: 'globe-result__meta', text: row.meta || '' }),
                ]);
            }));

            box.hidden = list.length === 0;
            input.setAttribute('aria-expanded', String(list.length > 0));
        }

        function close() {
            render([]);
        }

        function choose(row) {
            input.value = '';
            close();
            input.blur();
            ctx.onPick(row);
        }

        function moveCursor(step) {
            if (!results.length) return;
            cursor = (cursor + step + results.length) % results.length;
            const rows = box.children;
            for (let i = 0; i < rows.length; i++) {
                rows[i].classList.toggle('is-active', i === cursor);
            }
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                // Иначе Escape заодно сбросил бы выбор на глобусе — а человек
                // всего лишь закрывал подсказку поиска.
                event.stopPropagation();
                close();
                input.blur();
                return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveCursor(event.key === 'ArrowDown' ? 1 : -1);
                return;
            }
            if (event.key === 'Enter' && cursor >= 0) choose(results[cursor]);
        }

        input.addEventListener('input', function () {
            render(NF.globeData.search(input.value, LIMIT));
        });
        input.addEventListener('keydown', onKeyDown);

        /** Смена языка меняет названия стран — список надо пересобрать. */
        function refresh() {
            if (results.length) render(NF.globeData.search(input.value, LIMIT));
        }

        return {
            refresh: refresh,
            close: close,
            focus: function () { input.focus(); },
            hasFocus: function () { return document.activeElement === input; },
        };
    }

    return { create: create };
})();
