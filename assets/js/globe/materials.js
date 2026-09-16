/**
 * Материалы планеты: день, ночь, заря и срез поднятой страны.
 *
 * Перенесено из прототипа почти дословно. Логику менять нельзя без причины:
 * каждое число здесь — результат отдельной отладки, а не вкус.
 *
 * Шейдеры собраны массивом строк через join: шаблонные литералы в проекте
 * не используются, а GLSL всё равно живёт отдельной программой, и правится
 * он целыми строками.
 *
 * Три места, на которых легко потерять картинку:
 *
 *   1. `#include <colorspace_fragment>` в конце каждого фрагментного шейдера.
 *      Освещение считается в линейном свете, а на экран уходит через штатный
 *      include three: он повторяет настоящую кривую sRGB и слушается
 *      renderer.outputColorSpace. Без него всё темнеет примерно в 2,4 раза,
 *      и самодельный pow(1/2.2) это не чинит.
 *   2. pow() от отрицательного в GLSL не определён — там, где показатель
 *      мог уйти в минус, стоит умножение, а не pow.
 *   3. surface — три карты в одной текстуре: R рельеф, G ночные огни,
 *      B маска суши. Это не цвет, поэтому цветовое пространство у неё
 *      линейное: перевод sRGB исказил бы высоты и маску.
 */
window.NF = window.NF || {};

NF.globeMaterials = (function () {
    'use strict';

    /** Размер текселя карты surface: разность вперёд по ней даёт наклон рельефа. */
    const SURFACE_W = 2048;
    const SURFACE_H = 1024;

    /** Цвет зари на терминаторе и цвет ночных огней. */
    const DUSK_COLOR = '#ff9a5c';
    const LIGHTS_COLOR = '#ffd7a0';
    /** Тёплая кромка у верхнего края среза поднятой страны. */
    const LIFT_TOP_COLOR = '#ffc46b';

    /** Доля лунного света в освещении ночной стороны. */
    const DEFAULT_MOON_LIGHT = 0.3;

    function three() {
        return NF.three;
    }

    /**
     * Обёртки над картинками помним: материалов два, а текстура на видеокарте
     * должна остаться одна. Иначе тот же снимок уезжает в память дважды.
     */
    const wrapped = new WeakMap();

    /** Общие настройки любой нашей текстуры планеты. */
    function tune(texture, sRGB) {
        const THREE = three();
        if (sRGB) texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        // Без мип-уровней уменьшенная в разы карта осыпается в «пиксели»
        // даже без приближения.
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        return texture;
    }

    /** Готовые текстуры по ссылке: снимок не должен уехать на видеокарту дважды. */
    const byUrl = new Map();

    /** Ссылка на картинку: грузит её сам движок, кадры до загрузки не ждут. */
    function fromUrl(url, sRGB) {
        if (byUrl.has(url)) return byUrl.get(url);
        const texture = tune(new (three().TextureLoader)().load(url), sRGB);
        byUrl.set(url, texture);
        return texture;
    }

    /**
     * Текстуру задаёт страница — ссылкой, картинкой или готовой текстурой.
     * Принимаем все три: рассогласование между страницей и сценой не должно
     * кончаться чёрным шаром без объяснения.
     */
    function asTexture(value, sRGB) {
        const THREE = three();
        if (!value) throw new Error('Nowhere Fast: нет текстуры поверхности');
        if (typeof value === 'string') return fromUrl(value, sRGB);
        if (value.isTexture) return value;
        if (wrapped.has(value)) return wrapped.get(value);

        const texture = tune(new THREE.Texture(value), sRGB);
        texture.needsUpdate = true;
        // Картинка могла ещё не догрузиться: тогда тексель уедет на видеокарту
        // пустым и шар останется чёрным до первой правки uniform.
        if (!value.complete || !value.naturalWidth) {
            value.addEventListener('load', function () {
                texture.needsUpdate = true;
            }, { once: true });
        }
        wrapped.set(value, texture);
        return texture;
    }

    /** Земной снимок — цвет (sRGB), карта данных — линейная. */
    function prepare(textures) {
        return {
            earth: asTexture(textures && textures.earth, true),
            surface: asTexture(textures && textures.surface, false),
        };
    }

    const EARTH_VERTEX = [
        'varying vec2 vUv;',
        'varying vec3 vWorld;',
        'void main() {',
        '    vUv = uv;',
        '    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const EARTH_FRAGMENT = [
        'precision highp float;',
        '// uSurface — три карты в одной текстуре: R рельеф, G огни, B суша.',
        'uniform sampler2D uDay, uSurface;',
        'uniform vec3 uSun, uMoon, uCam, uDusk, uLights;',
        'uniform float uMoonLight;',
        'uniform vec2 uSurfaceTexel;',
        'varying vec2 vUv;',
        'varying vec3 vWorld;',
        '',
        'void main() {',
        '    vec3 n = normalize(vWorld);',
        '    vec3 view = normalize(uCam - vWorld);',
        '',
        '    vec3 surface = texture2D(uDay, vUv).rgb;',
        '',
        '    // Центральная выборка отдаёт сразу три карты: высоту, огни',
        '    // и маску суши. Раньше это были три отдельные текстуры.',
        '    vec3 dat = texture2D(uSurface, vUv).rgb;',
        '    float h0 = dat.r;',
        '    float lights = dat.g;',
        '    float land = dat.b;',
        '',
        '    // Рельеф: наклон поверхности по карте высот добавляем к нормали.',
        '    // Снимок плоский, а с этим появляются хребты, каньоны и вообще',
        '    // ощущение поверхности, а не картинки. Разность вперёд, а не',
        '    // центральная: два отсчёта вместо четырёх, а на такой сетке',
        '    // разницы на глаз нет.',
        '    float hR = texture2D(uSurface, vUv + vec2(uSurfaceTexel.x, 0.0)).r;',
        '    float hU = texture2D(uSurface, vUv + vec2(0.0, uSurfaceTexel.y)).r;',
        '',
        '    // Только по суше: рельеф дна на поверхности воды не виден,',
        '    // а блик Солнца от наклонённой нормали растекается пятном.',
        '    vec3 east = normalize(vec3(n.z, 0.0, -n.x));',
        '    vec3 north = normalize(cross(n, east));',
        '    n = normalize(n',
        '        - east * (hR - h0) * 18.0 * land',
        '        - north * (hU - h0) * 18.0 * land);',
        '',
        '    float sun = dot(n, uSun);',
        '    float day = smoothstep(-0.12, 0.18, sun);',
        '    float s = sun * 8.0;',
        '    float dusk = exp(-min(s * s, 40.0));   // pow() от отрицательного не определён',
        '    float moon = max(dot(n, uMoon), 0.0) * uMoonLight;',
        '',
        '    // Ночь честно темнее дня, но не чернота: иначе половина планеты',
        '    // выпадает и ориентироваться не по чему.',
        '    vec3 col = surface * (0.20 + day * 0.95 + moon * 0.28);',
        '    col += surface * uDusk * dusk * 0.5;',
        '',
        '    // Блик Солнца — только по воде.',
        '    float spec = pow(max(dot(reflect(-uSun, n), view), 0.0), 420.0)',
        '        * day * (1.0 - land);',
        '    col += vec3(1.0, 0.96, 0.88) * spec * 0.3;',
        '',
        '    // Огни городов гаснут с рассветом.',
        '    col += uLights * lights * lights * (1.0 - day) * 3.0;',
        '',
        '    gl_FragColor = vec4(col, 1.0);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    /** Материал Земли: день, ночь, заря, огни городов, блик по воде. */
    function earthMaterial(textures) {
        const THREE = three();
        const maps = prepare(textures);
        const uniforms = {
            uDay: { value: maps.earth },
            uSurface: { value: maps.surface },
            uSun: { value: new THREE.Vector3(1, 0, 0) },
            uMoon: { value: new THREE.Vector3(0, 1, 0) },
            uMoonLight: { value: DEFAULT_MOON_LIGHT },
            uCam: { value: new THREE.Vector3(0, 0, 1) },
            uSurfaceTexel: { value: new THREE.Vector2(1 / SURFACE_W, 1 / SURFACE_H) },
            uDusk: { value: new THREE.Color(DUSK_COLOR) },
            uLights: { value: new THREE.Color(LIGHTS_COLOR) },
        };

        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: EARTH_VERTEX,
            fragmentShader: EARTH_FRAGMENT,
        });
        return { material: material, uniforms: uniforms, textures: maps };
    }

    const CAP_VERTEX = [
        'varying vec3 vDir;',
        'void main() {',
        '    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const CAP_FRAGMENT = [
        'precision highp float;',
        'uniform sampler2D uDay, uSurface;',
        'uniform vec3 uSun;',
        'varying vec3 vDir;',
        'void main() {',
        '    vec3 n = normalize(vDir);',
        '    vec2 uv = vec2(atan(n.x, n.z) / 6.2831853 + 0.5,',
        '                   asin(clamp(n.y, -1.0, 1.0)) / 3.14159265 + 0.5);',
        '    vec3 surface = texture2D(uDay, uv).rgb;',
        '',
        '    vec2 texel = vec2(1.0 / ' + SURFACE_W.toFixed(1)
            + ', 1.0 / ' + SURFACE_H.toFixed(1) + ');',
        '    float h0 = texture2D(uSurface, uv).r;',
        '    float hR = texture2D(uSurface, uv + vec2(texel.x, 0.0)).r;',
        '    float hU = texture2D(uSurface, uv + vec2(0.0, texel.y)).r;',
        '    vec3 east = normalize(vec3(n.z, 0.0, -n.x));',
        '    vec3 north = normalize(cross(n, east));',
        '    vec3 shaded = normalize(n - east * (hR - h0) * 18.0 - north * (hU - h0) * 18.0);',
        '',
        '    float day = smoothstep(-0.12, 0.18, dot(shaded, uSun));',
        '    vec3 col = surface * (0.30 + day * 0.95) * 1.35;',
        '    gl_FragColor = vec4(col, 1.0);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    function sideFragment(radius) {
        return [
            'precision highp float;',
            'uniform vec3 uTop;',
            'uniform float uLiftUnits;',
            'varying float vRadius;',
            'void main() {',
            '    float t = clamp((vRadius - ' + radius.toFixed(1)
                + ') / max(0.5, uLiftUnits), 0.0, 1.0);',
            '    vec3 col = mix(vec3(0.04, 0.045, 0.06), uTop * 0.55, pow(t, 2.5));',
            '    // Полупрозрачная толща читается как срез земли,',
            '    // непрозрачная — как серая картонная плита.',
            '    gl_FragColor = vec4(col, 0.28 + 0.5 * pow(t, 2.0));',
            '    #include <colorspace_fragment>',
            '}',
        ].join('\n');
    }

    const SIDE_VERTEX = [
        'varying float vRadius;',
        'void main() {',
        '    vRadius = length((modelMatrix * vec4(position, 1.0)).xyz);',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    /**
     * Материалы поднятой страны: шапка и боковой срез.
     *
     * Шапка — настоящий снимок этого куска суши с тем же рельефом, что и у
     * планеты, плюс треть яркости: чтобы выбранное читалось и ночью.
     * Бок — тёмная толща с тёплой кромкой у самого верха.
     *
     * Uniform-блок у них общий: Солнце и высота подъёма пишутся один раз.
     */
    function liftMaterials(textures, radius) {
        const THREE = three();
        const maps = prepare(textures);
        const shared = {
            uDay: { value: maps.earth },
            uSurface: { value: maps.surface },
            uSun: { value: new THREE.Vector3(1, 0, 0) },
            uTop: { value: new THREE.Color(LIFT_TOP_COLOR) },
            uLiftUnits: { value: 4 },
        };

        const cap = new THREE.ShaderMaterial({
            uniforms: shared,
            vertexShader: CAP_VERTEX,
            fragmentShader: CAP_FRAGMENT,
        });

        const side = new THREE.ShaderMaterial({
            uniforms: shared,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            vertexShader: SIDE_VERTEX,
            fragmentShader: sideFragment(radius),
        });

        return { cap: cap, side: side, uniforms: shared };
    }

    return {
        earthMaterial: earthMaterial,
        liftMaterials: liftMaterials,
    };
})();
