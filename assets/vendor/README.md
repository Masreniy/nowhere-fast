# assets/vendor — собранные сторонние библиотеки

Здесь лежит код, который **написан не нами и не правится руками**. Каждый файл
собран скриптом из `tools/globe/` и перезаписывается при следующей пересборке.

| Файл | Что внутри | Пересобрать |
|---|---|---|
| `globe-engine.js` | `three` 0.186.0 + `three-globe` 2.45.2 + `three-geojson-geometry` 2.1.1 | `npm run build:globe-vendor` |

## globe-engine.js

Выкладывает наружу три имени:

```js
NF.three            // весь namespace three
NF.ThreeGlobe       // класс глобуса
NF.GeoJsonGeometry  // геометрия для контуров стран поверх шара
```

Подключается обычным тегом до всех файлов `assets/js/globe/*`:

```html
<script src="assets/vendor/globe-engine.js"></script>
```

Размер: 1 042 КБ, 293 КБ gzip.

Почему сборка, а не CDN: у `three@0.186` UMD-сборки нет вовсе — пакет только
ESM, а страницы проекта подключают скрипты без `type="module"`. Готовая
UMD-сборка `three-globe` весит 4 МБ, потому что внутрь запечён движок WebGPU,
которого в сцене нет. Подробности и способ пересборки —
в [tools/globe/README.md](../../tools/globe/README.md).

Лицензии всех трёх пакетов — MIT. Тексты и атрибуция — в `NOTICE`.
