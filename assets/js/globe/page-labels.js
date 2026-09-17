/**
 * Подписи и отметки поверх сцены глобуса.
 *
 * Слой живёт отдельно от page.js по двум причинам. Первая — размер: вместе
 * файл переваливал за норму в 400 строк. Вторая важнее: здесь единственное
 * место, которое пересчитывается каждый кадр, и его удобно читать целиком,
 * не пролистывая интерфейс.
 *
 * Весь текст попадает в документ через NF.dom и textContent. Позиции узлов
 * задаются transform, а не разметкой: перестроение дерева каждый кадр заметно
 * глазом как мигание.
 */
window.NF = window.NF || {};

NF.globeLabels = (function () {
    'use strict';

    /** Минимальные зазоры между подписями, в пикселях экрана. */
    const GAP_PIN = 52;
    const GAP_OWN = 58;
    const GAP_NEAR = 64;
    const GAP_STAR = 70;

    /** Подпись выбранного места поднимается над точкой, чтобы не затирать город. */
    const TARGET_LIFT = 30;

    /** Ближе этой доли полного обзора показываем соседние города. */
    const NEAR_ZOOM = 0.75;

    /** Имён звёзд больше десятка на экране не читается — это шум, а не небо. */
    const MAX_STARS = 14;

    function create(layer) {
        const dom = NF.dom;
        const pool = new Map();
        const used = new Set();
        const placed = [];

        /** Текстовая подпись. Узел переиспользуется между кадрами. */
        function textLabel(key, cls, text) {
            let node = pool.get(key);
            if (!node) {
                node = dom.el('div', { class: 'globe-label ' + cls });
                layer.appendChild(node);
                pool.set(key, node);
            }
            if (node.textContent !== text) node.textContent = text;
            used.add(key);
            return node;
        }

        /** Отметка города, который есть в продукте: точка, имя и клик. */
        function pinLabel(mark) {
            const key = 'pin-' + mark.key;
            let node = pool.get(key);
            if (!node) {
                node = dom.el('button', {
                    class: 'globe-pin',
                    attrs: { type: 'button', title: mark.hint || null },
                    on: { click: mark.onPick },
                }, [
                    dom.el('span', { class: 'globe-pin__dot' }),
                    dom.el('span', { text: mark.title }),
                ]);
                layer.appendChild(node);
                pool.set(key, node);
            }
            used.add(key);
            return node;
        }

        /**
         * Ставит узел в точку экрана.
         *
         * Невидимый узел гасится, а не удаляется: пересозданная подпись мигает
         * при каждом повороте, не досчитав переход. Заодно снимаются события —
         * иначе прозрачная отметка продолжает ловить клики.
         */
        function place(node, point) {
            if (!point || !point.visible) {
                node.style.opacity = '0';
                node.style.pointerEvents = 'none';
                return;
            }
            node.style.transform =
                'translate(-50%, -50%) translate(' + point.x + 'px, ' + point.y + 'px)';
            node.style.opacity = '1';
            node.style.pointerEvents = '';
        }

        /** Свободно ли место: подписи не должны налезать друг на друга. */
        function freeSpot(point, gap) {
            if (!point || !point.visible) return false;
            for (let i = 0; i < placed.length; i++) {
                const other = placed[i];
                if (Math.abs(other.x - point.x) < gap &&
                    Math.abs(other.y - point.y) < gap * 0.6) return false;
            }
            placed.push(point);
            return true;
        }

        // --- Группы подписей ---------------------------------------------

        function drawPins(view) {
            const chosen = view.selection && view.selection.kind === 'city'
                ? view.selection.index : null;

            view.pins.forEach(function (mark) {
                // У выбранного города уже есть своя крупная подпись. Отметка
                // рядом с ней читалась как два разных города с одним именем.
                if (chosen !== null && mark.cityIndex === chosen) return;
                const point = view.globe.projectSurface(mark.lat, mark.lng);
                const node = pinLabel(mark);
                place(node, freeSpot(point, GAP_PIN) ? point : null);
            });
        }

        function drawOrigin(view) {
            const origin = view.globe.state.origin;
            if (!origin) return;
            const point = view.globe.projectSurface(origin.lat, origin.lng);
            freeSpot(point, GAP_OWN);
            place(textLabel('origin', 'globe-label--origin', origin.name || view.text.here), point);
        }

        function drawSelection(view) {
            const selection = view.selection;
            if (!selection) return;

            // Города самой выбранной страны: они стоят на поднятом куске,
            // и без подписей это просто точки, по которым ничего не понять.
            view.countryCities.forEach(function (city) {
                if (selection.kind === 'city' && city.index === selection.index) return;
                const point = view.globe.projectSurface(city.lat, city.lng);
                const node = textLabel('own-' + city.index, 'globe-label--own', city.name);
                place(node, freeSpot(point, GAP_OWN) ? point : null);
            });

            const target = view.globe.projectSurface(selection.lat, selection.lng);
            if (target && target.visible) target.y -= TARGET_LIFT;
            freeSpot(target, TARGET_LIFT);
            place(textLabel('target', 'globe-label--target', view.title), target);

            if (!nearVisible(view.globe)) return;
            view.nearby.forEach(function (city) {
                const point = view.globe.projectSurface(city.lat, city.lng);
                const node = textLabel('near-' + city.index, 'globe-label--near', city.name);
                place(node, freeSpot(point, GAP_NEAR) ? point : null);
            });
        }

        /** Соседей показываем только вблизи: издали это каша из точек. */
        function nearVisible(globe) {
            if (typeof globe.distance !== 'number' || typeof globe.fit !== 'number') return true;
            return globe.distance < globe.fit * NEAR_ZOOM;
        }

        function drawSky(view) {
            const globe = view.globe;
            if (globe.sunWorld) {
                place(textLabel('sun', 'globe-label--sky', view.text.sun),
                    globe.projectPoint(globe.sunWorld));
            }
            if (globe.moonWorld) {
                place(textLabel('moon', 'globe-label--sky', view.text.moon),
                    globe.projectPoint(globe.moonWorld));
            }
            if (typeof globe.skyDirection !== 'function') return;

            // Имена ярких звёзд — это и есть проверка «небо настоящее»:
            // их можно сверить с любым планетарием.
            view.stars.slice(0, MAX_STARS).forEach(function (star, i) {
                const point = globe.projectPoint(globe.skyDirection(star.ra, star.dec));
                const node = textLabel('star-' + i, 'globe-label--star', view.starName(star));
                place(node, freeSpot(point, GAP_STAR) ? point : null);
            });
        }

        // --- Публичное ------------------------------------------------------

        /** Пересчёт кадра. Узлы, которые в этом кадре не понадобились, убираются. */
        function update(view) {
            used.clear();
            placed.length = 0;

            drawPins(view);
            drawOrigin(view);
            drawSelection(view);
            drawSky(view);

            pool.forEach(function (node, key) {
                if (used.has(key)) return;
                node.remove();
                pool.delete(key);
            });
        }

        /** Смена языка меняет тексты — проще пересобрать, чем сверять каждый. */
        function reset() {
            pool.forEach(function (node) { node.remove(); });
            pool.clear();
        }

        /** Днём звёздные подписи гаснут: с земли звёзд не видно. */
        function setDaylight(day) {
            layer.style.setProperty('--sky-fade', String(1 - day));
        }

        return { update: update, reset: reset, setDaylight: setDaylight };
    }

    return { create: create };
})();
