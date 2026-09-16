/**
 * Заглушка для веток three-globe, которых нет в сцене.
 *
 * Слой тайловой карты тянет `three/webgpu` и `three/tsl`, гексбины — `h3-js`.
 * Ни того, ни другого мы не включаем, страница создаёт обычный WebGLRenderer,
 * но сборщик всё равно клал 900 КБ этого кода в файл, а браузер разбирал и
 * компилировал его при загрузке — 40 МБ кучи впустую.
 *
 * Имена перечислены поимённо, а не через `export default`, намеренно: если
 * three-globe в новой версии попросит что-то ещё, сборка упадёт с понятной
 * ошибкой, а не тихо подсунет пустоту. Вызов заглушки тоже падает — значит,
 * слой всё-таки включили, и заглушку пора убирать.
 */
const notBundled = (name) => () => {
    throw new Error(`${name}: этот слой three-globe исключён из сборки (src/stub-unused.js)`);
};

/* h3-js — гексбины */
export const latLngToCell = notBundled('latLngToCell');
export const cellToLatLng = notBundled('cellToLatLng');
export const cellToBoundary = notBundled('cellToBoundary');
export const polygonToCells = notBundled('polygonToCells');

/* three/webgpu — тайловая карта */
export class WebGPURenderer {
    constructor() { notBundled('WebGPURenderer')(); }
}
export class StorageInstancedBufferAttribute {
    constructor() { notBundled('StorageInstancedBufferAttribute')(); }
}

export default {};
