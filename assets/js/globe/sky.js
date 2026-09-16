/**
 * Небо: звёзды, созвездия, Солнце, Луна, дневной купол и земля под ногами.
 *
 * Земля в сцене неподвижна, а небо поворачивается на звёздное время. Для
 * наблюдателя это одно и то же, но размещать города и страны в неподвижной
 * системе куда надёжнее — иначе каждый клик надо разворачивать обратно.
 *
 * Данные звёзд приходят из assets/data/globe-stars.js (NF.globeStars):
 * типизированные массивы в base64, распаковка описана в шапке того файла.
 *
 * Что здесь нельзя потерять при правке:
 *   - созвездия гасятся visible = false, а не opacity = 0: прозрачность
 *     не отменяет отрисовку, объект по-прежнему уезжал отдельным вызовом
 *     и растеризовал 743 отрезка ради ничего;
 *   - под ногами не карта, а тёмная земля в дымке: снимок 10 км на пиксель
 *     с высоты человека превращается в мыло. Так делают планетарии — и по
 *     той же причине;
 *   - `#include <colorspace_fragment>` обязателен в каждом фрагментном
 *     шейдере, см. пояснение в materials.js.
 */
window.NF = window.NF || {};

NF.globeSky = (function () {
    'use strict';

    /** Радиусы сфер сцены: звёзды дальше всех, купол неба ближе всех. */
    const STAR_RADIUS = 3000;
    const SUN_RADIUS = 2600;
    const MOON_RADIUS = 1500;
    const SKY_RADIUS = 2200;

    /** Видимый угловой радиус Луны — полградуса на небе. */
    const MOON_ANGULAR_DEG = 0.26;
    const DEG = Math.PI / 180;

    /** Звёздная величина логарифмическая: шаг в единицу — в 2,5 раза ярче. */
    const STAR_SIZE_MAX = 5.6;
    const STAR_SIZE_MIN = 1.3;
    const STAR_SIZE_K = 0.72;
    /** Распаковка величины и цвета: см. шапку globe-stars.js. */
    const MAG_SCALE = 25;
    const MAG_SHIFT = 2;
    const BV_SCALE = 50;
    const DEC_SCALE = 100;
    const RA_SCALE = 65535;

    const CONSTELLATION_COLOR = 0x7fa3d6;
    const CONSTELLATION_OPACITY = 0.26;

    const SUN_DISC_RADIUS = 12;
    const SUN_HALO_RADIUS = 46;
    const SUN_SEGMENTS = 48;
    const SUN_RENDER_ORDER = 12;

    /** Земля под ногами: круг вчетверо шире купола, чтобы не видеть край. */
    const GROUND_SPAN = SKY_RADIUS * 4;
    const GROUND_SEGMENTS = 128;
    const GROUND_DROP = 0.6;
    const HAZE_SCALE = SKY_RADIUS * 0.95;

    const HAZE_COLOR = '#7e9ab8';
    const GROUND_COLOR = '#161e18';

    function three() {
        return NF.three;
    }

    /** base64 → типизированный массив. Готовый массив пропускаем как есть. */
    function decode(value, Type) {
        if (!value) return new Type(0);
        if (typeof value !== 'string') return value;
        const bin = atob(value);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new Type(bytes.buffer);
    }

    /**
     * Цвет звезды по показателю B−V: горячие голубые, холодные оранжевые.
     * Это не украшение — по цвету Бетельгейзе и Ригель различаются глазом.
     */
    function starColor(bv) {
        const THREE = three();
        const t = Math.max(-0.4, Math.min(2.0, bv));
        const warm = (t + 0.4) / 2.4;
        return new THREE.Color().setRGB(
            0.66 + 0.34 * warm,
            0.76 + 0.14 * (1 - Math.abs(warm - 0.45) * 2),
            1.0 - 0.5 * warm
        );
    }

    const STAR_VERTEX = [
        'attribute vec3 aColor;',
        'attribute float aSize;',
        'uniform float uPixelRatio, uOpacity;',
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '    vColor = aColor;',
        '    vAlpha = uOpacity * clamp(aSize / 5.6 + 0.22, 0.38, 1.0);',
        '    gl_PointSize = aSize * uPixelRatio;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const STAR_FRAGMENT = [
        'varying vec3 vColor;',
        'varying float vAlpha;',
        'void main() {',
        '    float d = length(gl_PointCoord - 0.5);',
        '    if (d > 0.5) discard;',
        '    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d) * vAlpha);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    function buildStars(catalog) {
        const THREE = three();
        const ra = decode(catalog.ra, Uint16Array);
        const dec = decode(catalog.dec, Int16Array);
        const mag = decode(catalog.mag, Uint8Array);
        const bv = decode(catalog.bv, Int8Array);
        const count = catalog.count || ra.length;

        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const v = NF.globeCamera.coords(
                dec[i] / DEC_SCALE, (ra[i] / RA_SCALE) * 360, STAR_RADIUS);
            positions[i * 3] = v.x;
            positions[i * 3 + 1] = v.y;
            positions[i * 3 + 2] = v.z;
            const c = starColor(bv[i] / BV_SCALE);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
            sizes[i] = Math.max(STAR_SIZE_MIN,
                STAR_SIZE_MAX - STAR_SIZE_K * (mag[i] / MAG_SCALE - MAG_SHIFT));
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        const uniforms = { uPixelRatio: { value: 1 }, uOpacity: { value: 1 } };
        const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
            uniforms: uniforms,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexShader: STAR_VERTEX,
            fragmentShader: STAR_FRAGMENT,
        }));
        points.frustumCulled = false;
        return { points: points, uniforms: uniforms };
    }

    /** Линии созвездий: отрезки подряд, длины сегментов лежат отдельно. */
    function constellationSegments(source) {
        const ra = decode(source.ra, Uint16Array);
        const dec = decode(source.dec, Int16Array);
        const lens = decode(source.lens, Uint16Array);

        const segments = [];
        let cursor = 0;
        for (let s = 0; s < lens.length; s++) {
            for (let i = 0; i < lens[s] - 1; i++) {
                for (let e = 0; e < 2; e++) {
                    const idx = cursor + i + e;
                    const v = NF.globeCamera.coords(
                        dec[idx] / DEC_SCALE, (ra[idx] / RA_SCALE) * 360, STAR_RADIUS);
                    segments.push(v.x, v.y, v.z);
                }
            }
            cursor += lens[s];
        }
        return segments;
    }

    function buildConstellations(source) {
        const THREE = three();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(
            new Float32Array(constellationSegments(source)), 3));
        const material = new THREE.LineBasicMaterial({
            color: CONSTELLATION_COLOR,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const lines = new THREE.LineSegments(geometry, material);
        lines.frustumCulled = false;
        lines.visible = false;
        return { lines: lines, material: material };
    }

    const HALO_VERTEX = [
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = uv;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const HALO_FRAGMENT = [
        'varying vec2 vUv;',
        'void main() {',
        '    float d = length(vUv - 0.5) * 2.0;',
        '    float a = pow(clamp(1.0 - d, 0.0, 1.0), 3.0);',
        '    gl_FragColor = vec4(1.0, 0.86, 0.62, a * 0.6);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    function buildSun() {
        const THREE = three();
        const group = new THREE.Group();
        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(SUN_DISC_RADIUS, SUN_SEGMENTS),
            new THREE.MeshBasicMaterial({
                color: 0xfff4d8, transparent: true, depthWrite: false,
            })
        );
        const halo = new THREE.Mesh(
            new THREE.CircleGeometry(SUN_HALO_RADIUS, SUN_SEGMENTS),
            new THREE.ShaderMaterial({
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                vertexShader: HALO_VERTEX,
                fragmentShader: HALO_FRAGMENT,
            })
        );
        group.add(halo, disc);
        return { group: group, disc: disc, halo: halo };
    }

    const MOON_VERTEX = [
        'varying vec3 vNormalW;',
        'varying vec3 vPos;',
        'void main() {',
        '    vNormalW = normalize(mat3(modelMatrix) * normal);',
        '    vPos = position;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const MOON_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uSun;',
        'varying vec3 vNormalW;',
        'varying vec3 vPos;',
        'float hash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 31.7, 53.3))) * 43758.5453); }',
        'float noise(vec3 p) {',
        '    vec3 i = floor(p), f = fract(p);',
        '    f = f * f * (3.0 - 2.0 * f);',
        '    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),',
        '                   mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),',
        '               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),',
        '                   mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);',
        '}',
        'void main() {',
        '    vec3 n = normalize(vPos);',
        '    float lit = clamp(dot(normalize(vNormalW), uSun), 0.0, 1.0);',
        '    float maria = smoothstep(0.45, 0.62, noise(n * 3.1) * 0.7 + noise(n * 7.0) * 0.3);',
        '    vec3 base = mix(vec3(0.78, 0.76, 0.72), vec3(0.34, 0.34, 0.37), maria);',
        '    gl_FragColor = vec4(base * (0.02 + pow(lit, 0.8) * 0.98), 1.0);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    function buildMoon() {
        const THREE = three();
        const uniforms = { uSun: { value: new THREE.Vector3(1, 0, 0) } };
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 48, 32),
            new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: MOON_VERTEX,
                fragmentShader: MOON_FRAGMENT,
            })
        );
        mesh.scale.setScalar(MOON_RADIUS * Math.tan(MOON_ANGULAR_DEG * DEG) * 2);
        return { mesh: mesh, uniforms: uniforms };
    }

    /** Плёночная кривая (приближение ACES) — общая для купола и земли. */
    const FILMIC = [
        '// Плёночная кривая (приближение ACES): яркое перестаёт обрезаться',
        '// в белый, а сохраняет цвет и форму.',
        'vec3 filmic(vec3 x) {',
        '    x *= 0.6;',
        '    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14),',
        '                 0.0, 1.0);',
        '}',
    ].join('\n');

    const DOME_VERTEX = [
        'varying vec3 vDir;',
        'void main() {',
        '    vDir = normalize(position);',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const DOME_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uSun, uUp;',
        'uniform float uDaylight, uExposure;',
        'varying vec3 vDir;',
        '',
        FILMIC,
        '',
        'void main() {',
        '    float height = clamp(dot(vDir, uUp), -1.0, 1.0);',
        '    float toSun = clamp(dot(vDir, uSun), -1.0, 1.0);',
        '',
        '    vec3 zenith = vec3(0.05, 0.15, 0.42);',
        '    vec3 horizon = vec3(0.40, 0.55, 0.76);',
        '    float t = pow(clamp(1.0 - max(height, 0.0), 0.0, 1.0), 3.2);',
        '    vec3 col = mix(zenith, horizon, t);',
        '',
        '    // Ореол вокруг Солнца — узкий, иначе он заливает белым весь',
        '    // горизонт и небо теряет глубину.',
        '    float halo = pow(max(toSun, 0.0), 28.0);',
        '    col += vec3(1.0, 0.9, 0.72) * halo * 0.55;',
        '',
        '    // Заря: тёплая подсветка только у горизонта и только в той',
        '    // стороне, где Солнце.',
        '    float glow = pow(max(toSun, 0.0), 6.0)',
        '        * pow(clamp(1.0 - max(height, 0.0), 0.0, 1.0), 9.0);',
        '    col += vec3(1.0, 0.52, 0.22) * glow * 0.45;',
        '',
        '    float below = smoothstep(-0.12, 0.02, height);',
        '    gl_FragColor = vec4(filmic(col * uExposure), uDaylight * below);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    /**
     * Дневное небо для взгляда с земли: купол вокруг наблюдателя, а не заливка
     * поверх кадра. Сквозь него видно землю под ногами, Солнце рисуется поверх.
     */
    function buildDome() {
        const THREE = three();
        const uniforms = {
            uSun: { value: new THREE.Vector3(0, 1, 0) },
            uUp: { value: new THREE.Vector3(0, 1, 0) },
            uDaylight: { value: 0 },
            uExposure: { value: 1 },
        };
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(SKY_RADIUS, 48, 32),
            new THREE.ShaderMaterial({
                uniforms: uniforms,
                side: THREE.BackSide,
                transparent: true,
                depthWrite: false,
                vertexShader: DOME_VERTEX,
                fragmentShader: DOME_FRAGMENT,
            })
        );
        mesh.visible = false;
        mesh.renderOrder = -1;
        return { mesh: mesh, uniforms: uniforms };
    }

    const GROUND_VERTEX = [
        'varying vec2 vLocal;',
        'void main() {',
        '    vLocal = position.xy;',
        '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
    ].join('\n');

    const GROUND_FRAGMENT = [
        'precision highp float;',
        'uniform vec3 uHaze, uGround;',
        'uniform float uDaylight, uExposure;',
        'varying vec2 vLocal;',
        '',
        FILMIC,
        '',
        'float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }',
        'float noise(vec2 p) {',
        '    vec2 i = floor(p), f = fract(p);',
        '    f = f * f * (3.0 - 2.0 * f);',
        '    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
        '               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);',
        '}',
        '',
        'void main() {',
        '    float d = length(vLocal) / ' + HAZE_SCALE.toFixed(1) + ';',
        '',
        '    // Чем дальше к горизонту, тем больше воздуха между нами и землёй —',
        '    // там она и растворяется в дымке.',
        '    float haze = pow(clamp(d, 0.0, 1.0), 11.0);',
        '    float grain = noise(vLocal * 0.06) * 0.35 + noise(vLocal * 0.4) * 0.15;',
        '',
        '    vec3 ground = uGround * (0.5 + grain) * (0.12 + uDaylight * 0.88);',
        '    vec3 col = mix(ground, uHaze * (0.05 + uDaylight * 0.95), haze);',
        '',
        '    gl_FragColor = vec4(filmic(col * uExposure), 1.0);',
        '    #include <colorspace_fragment>',
        '}',
    ].join('\n');

    function buildGround() {
        const THREE = three();
        const uniforms = {
            uDaylight: { value: 0 },
            uExposure: { value: 1 },
            uHaze: { value: new THREE.Color(HAZE_COLOR) },
            uGround: { value: new THREE.Color(GROUND_COLOR) },
        };
        const mesh = new THREE.Mesh(
            new THREE.CircleGeometry(GROUND_SPAN, GROUND_SEGMENTS),
            new THREE.ShaderMaterial({
                uniforms: uniforms,
                side: THREE.DoubleSide,
                transparent: true,
                depthWrite: false,
                vertexShader: GROUND_VERTEX,
                fragmentShader: GROUND_FRAGMENT,
            })
        );
        mesh.visible = false;
        mesh.renderOrder = -2;
        return { mesh: mesh, uniforms: uniforms };
    }

    /**
     * Собирает небо целиком.
     *
     * @param {Object} catalog NF.globeStars: звёзды и, внутри, созвездия
     * @returns объект с узлами сцены и методами покадрового обновления
     */
    function create(catalog) {
        const THREE = three();
        const source = catalog || {};
        const stars = buildStars(source);
        const constellations = buildConstellations(source.constellations || {});
        const sun = buildSun();
        const moon = buildMoon();
        const dome = buildDome();
        const ground = buildGround();

        // Звёзды и созвездия — одна группа: она и поворачивается на звёздное
        // время. Солнце и Луна ходят по небу сами, их считает астрономия.
        const group = new THREE.Group();
        group.add(stars.points, constellations.lines);

        /** Нормаль круга земли — по оси Z: его и разворачиваем к зениту. */
        const GROUND_AXIS = new THREE.Vector3(0, 0, 1);
        const UP_AXIS = new THREE.Vector3(0, 1, 0);

        let appliedSky = null;

        return {
            group: group,
            stars: stars,
            constellations: constellations,
            sun: sun,
            moon: moon,
            dome: dome,
            ground: ground,

            /** Всё, что нужно добавить в сцену. */
            objects: [group, sun.group, moon.mesh, dome.mesh, ground.mesh],

            /** Размер точки звезды считается в физических пикселях. */
            setPixelRatio: function (dpr) {
                stars.uniforms.uPixelRatio.value = dpr;
            },

            /** Поворот неба на звёздное время. */
            setSidereal: function (angle) {
                group.rotation.y = -angle;
            },

            /** Куда смотреть на небе по экваториальным координатам. */
            direction: function (raDeg, decDeg) {
                return NF.globeCamera.coords(decDeg, raDeg, STAR_RADIUS)
                    .applyAxisAngle(UP_AXIS, group.rotation.y);
            },

            /** Ставит Солнце и Луну по направлениям из астрономии. */
            place: function (sunDir, moonDir, sunWorld, moonWorld) {
                sunWorld.copy(sunDir).multiplyScalar(SUN_RADIUS);
                sun.group.position.copy(sunWorld);
                sun.group.lookAt(0, 0, 0);
                moonWorld.copy(moonDir).multiplyScalar(MOON_RADIUS);
                moon.mesh.position.copy(moonWorld);
                moon.uniforms.uSun.value.copy(sunWorld).normalize();
                dome.uniforms.uSun.value.copy(sunDir);
            },

            /**
             * Режим неба: купол и земля видны, Солнце светит сквозь купол.
             * Это свойство режима, а не кадра, — пишем при переключении.
             */
            setMode: function (inSky) {
                dome.mesh.visible = inSky;
                ground.mesh.visible = inSky;
                if (inSky === appliedSky) return;
                appliedSky = inSky;
                sun.disc.material.depthTest = !inSky;
                sun.halo.material.depthTest = !inSky;
                sun.group.renderOrder = inSky ? SUN_RENDER_ORDER : 0;
            },

            /** Земля под ногами разворачивается к зениту наблюдателя. */
            placeGround: function (position, up) {
                ground.mesh.position.copy(position).addScaledVector(up, -GROUND_DROP);
                ground.mesh.quaternion.setFromUnitVectors(GROUND_AXIS, up);
                dome.uniforms.uUp.value.copy(up);
                dome.mesh.position.copy(position);
            },

            /**
             * Свет дня: днём небо светлое и звёзд не видно — это и есть
             * проверка, что время и место учтены по-настоящему.
             */
            setDaylight: function (daylight, exposure, showConstellations) {
                dome.uniforms.uDaylight.value = daylight * 0.96;
                dome.uniforms.uExposure.value = exposure;
                ground.uniforms.uDaylight.value = daylight;
                ground.uniforms.uExposure.value = exposure;
                stars.uniforms.uOpacity.value = 1 - daylight;

                const showLines = showConstellations && daylight < 1;
                constellations.lines.visible = showLines;
                if (showLines) {
                    constellations.material.opacity = CONSTELLATION_OPACITY * (1 - daylight);
                }
            },

            dispose: function () {
                [stars.points, constellations.lines, sun.disc, sun.halo,
                    moon.mesh, dome.mesh, ground.mesh].forEach(function (node) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) node.material.dispose();
                });
            },
        };
    }

    return {
        STAR_RADIUS: STAR_RADIUS,
        SUN_RADIUS: SUN_RADIUS,
        MOON_RADIUS: MOON_RADIUS,
        SKY_RADIUS: SKY_RADIUS,
        create: create,
    };
})();
