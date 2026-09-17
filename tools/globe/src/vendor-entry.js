/**
 * Точка входа бандла сторонних библиотек глобуса.
 *
 * Зачем файл вообще нужен: страницы проекта подключаются классическими тегами
 * `<script src>`, без `type="module"`. А `three@0.186` поставляется только как
 * ES-модули — UMD-сборки в пакете нет вовсе. Соединить одно с другим можно
 * ровно одним способом: собрать нужные модули в один IIFE и выложить наружу
 * через глобальный `NF`, как это делают все остальные файлы проекта.
 *
 * Выкладываем ровно то, что импортирует сцена (прототип `src/globe.js`):
 * весь namespace `three`, класс `ThreeGlobe` и `GeoJsonGeometry` — им рисуются
 * контуры стран поверх шара. Ничего «про запас»: каждый лишний экспорт тянет
 * за собой код, который потом невозможно выкинуть из сборки.
 *
 * `Line2`, `LineMaterial` и прочее из `three/examples/jsm` сюда не попадает
 * намеренно: их импортирует сам `three-globe`, esbuild подтягивает их внутрь
 * бандла, и снаружи они не нужны.
 */
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import GeoJsonGeometry from 'three-geojson-geometry';

window.NF = window.NF || {};
NF.three = THREE;
NF.ThreeGlobe = ThreeGlobe;
NF.GeoJsonGeometry = GeoJsonGeometry;
