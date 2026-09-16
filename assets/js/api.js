/**
 * Слой доступа к данным.
 *
 * Единственное место в проекте, которое знает про таблицы и про Supabase.
 * Страницы вызывают функции отсюда и не строят запросы сами — иначе одно и то
 * же обращение расползается по файлам и расходится при первой же правке.
 *
 * Клиент создаётся здесь один раз. Раньше он создавался трижды — по копии
 * в каждой странице, вместе с копией ключа.
 */
window.NF = window.NF || {};

NF.api = (function () {
    'use strict';

    const client = window.supabase.createClient(
        NF.config.SUPABASE_URL,
        NF.config.SUPABASE_KEY
    );

    /** Код PostgREST: запрос с .single() не вернул ни одной строки. */
    const NOT_FOUND = 'PGRST116';

    /** Символы, которые ilike трактует как шаблон, а не как текст. */
    const PATTERN_CHARS = /[%_*]/;

    function fail(error) {
        const err = new Error(error.message || 'Ошибка запроса');
        err.code = error.code;
        err.original = error;
        throw err;
    }

    // --- Города -----------------------------------------------------------

    async function listCities() {
        const { data, error } = await client
            .from('cities')
            .select('id, name, name_local, country, description, image_url')
            .order('name');
        if (error) fail(error);
        return data || [];
    }

    async function getCityById(id) {
        const { data, error } = await client
            .from('cities')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) fail(error);
        return data;
    }

    /**
     * Поиск города по названию.
     *
     * Нужен только для обратной совместимости со старыми ссылками вида
     * city.html?city=Гуанчжоу. Новые ссылки используют id: имя меняется,
     * а ссылки после этого ломаются.
     *
     * maybeSingle вместо single: при дубликатах имён single бросает ошибку,
     * и страница падает вместо того, чтобы показать понятное сообщение.
     *
     * Имя приходит из адресной строки, то есть от кого угодно. Для ilike знаки
     * %, _ и * — это шаблон: по ссылке city.html?city=%25 открылся бы «первый
     * попавшийся город», и человек решил бы, что попал куда хотел. В названиях
     * городов таких знаков не бывает, поэтому запрос просто не делается.
     */
    async function getCityByName(name) {
        if (PATTERN_CHARS.test(String(name))) return null;

        const { data, error } = await client
            .from('cities')
            .select('*')
            .ilike('name', name)
            .limit(1)
            .maybeSingle();
        if (error && error.code !== NOT_FOUND) fail(error);
        return data;
    }

    // --- Места (ADR-0004) -------------------------------------------------

    /**
     * Места города.
     *
     * Ключевая выборка для планировщика: у каждого места есть координаты,
     * поэтому его можно разместить во времени и пространстве.
     */
    async function listPlaces(cityId) {
        const { data, error } = await client
            .from('places')
            .select('id, name, name_local, description, address, address_local, ' +
                    'lat, lng, category, visit_minutes, price_level, source')
            .eq('city_id', cityId)
            .order('name');
        if (error) fail(error);
        return data || [];
    }

    /**
     * Кто сейчас вошёл. null — не вошёл никто.
     *
     * getSession читает уже сохранённую сессию и в сеть не ходит, поэтому
     * подходит для проверки «можно ли вообще писать» до отправки запроса.
     */
    async function currentUserId() {
        const { data, error } = await client.auth.getSession();
        if (error) fail(error);
        return data && data.session ? data.session.user.id : null;
    }

    /**
     * Создать место.
     *
     * Два поля выставляются здесь, а не вызывающей страницей, и это намеренно.
     *
     * author_id — политика places_insert_own требует, чтобы он совпадал
     * с auth.uid(). Страница, забывшая его передать, получала бы отказ RLS
     * с непонятным текстом. Знание о политике живёт в слое данных.
     *
     * is_published — место создаётся ЧЕРНОВИКОМ. Умолчание в схеме false,
     * и обходить его из интерфейса нельзя: иначе новое место публикуется молча.
     */
    async function createPlace(place) {
        const authorId = await currentUserId();
        if (!authorId) {
            const err = new Error('Запись доступна только после входа');
            err.code = 'NO_SESSION';
            throw err;
        }

        const row = Object.assign({}, place, {
            author_id: authorId,
            is_published: false,
        });

        const { data, error } = await client.from('places').insert(row).select().single();
        if (error) fail(error);
        return data;
    }

    async function deletePlace(id) {
        const { error } = await client.from('places').delete().eq('id', id);
        if (error) fail(error);
    }

    // --- Маршруты ---------------------------------------------------------

    /**
     * Маршруты города вместе с днями и активностями.
     *
     * Один запрос вместо лестницы циклов. Раньше здесь было N+1: на каждый
     * маршрут отдельный запрос дней, на каждый день — запрос активностей.
     * Маршрут на 5 дней означал 11 обращений к базе.
     *
     * Вложенная выборка требует объявленных внешних ключей: PostgREST строит
     * связь по ним. Если ключей в базе нет, запрос вернёт ошибку — тогда
     * работает запасной путь с последовательной загрузкой, чтобы страница
     * оставалась рабочей, а причина была видна в консоли.
     */
    async function listRoutes(cityId) {
        const { data, error } = await client
            .from('route_templates')
            .select(
                'id, name, description, days_count, difficulty, ' +
                'route_template_days (id, day_number, name, description, ' +
                    'route_template_activities (id, order_in_day, name, description, location, ' +
                        'duration_minutes, ' +
                        'places (id, name, name_local, address_local, lat, lng)))'
            )
            .eq('city_id', cityId)
            .order('name');

        if (error) {
            console.warn(
                'Nowhere Fast: вложенная выборка маршрутов не сработала. ' +
                'Вероятная причина — в базе не объявлены внешние ключи между ' +
                'route_templates, route_template_days и route_template_activities. ' +
                'Применение supabase/schema.sql это исправляет.',
                error
            );
            return listRoutesSequentially(cityId);
        }

        return (data || []).map(sortRouteContents);
    }

    /**
     * Сортировка выполняется здесь, а не в запросе.
     *
     * Порядок вложенных таблиц задаётся параметром, который в разных версиях
     * postgrest-js называется по-разному (foreignTable / referencedTable).
     * Несовпадение имени не вызывает ошибку — запрос просто возвращает данные
     * в произвольном порядке, и дни маршрута перемешиваются незаметно.
     * Сортировка на клиенте не зависит от версии библиотеки.
     */
    function sortRouteContents(route) {
        const days = (route.route_template_days || [])
            .slice()
            .sort(function (a, b) { return (a.day_number || 0) - (b.day_number || 0); })
            .map(function (day) {
                const activities = (day.route_template_activities || [])
                    .slice()
                    .sort(function (a, b) { return (a.order_in_day || 0) - (b.order_in_day || 0); });
                return Object.assign({}, day, { route_template_activities: activities });
            });
        return Object.assign({}, route, { route_template_days: days });
    }

    /** Запасной путь, когда вложенная выборка недоступна. */
    async function listRoutesSequentially(cityId) {
        const { data: routes, error } = await client
            .from('route_templates')
            .select('*')
            .eq('city_id', cityId)
            .order('name');
        if (error) fail(error);
        if (!routes || routes.length === 0) return [];

        const routeIds = routes.map(function (r) { return r.id; });
        const { data: days, error: daysError } = await client
            .from('route_template_days')
            .select('*')
            .in('route_template_id', routeIds);
        if (daysError) fail(daysError);

        const dayIds = (days || []).map(function (d) { return d.id; });
        let activities = [];
        if (dayIds.length > 0) {
            const { data: acts, error: actsError } = await client
                .from('route_template_activities')
                .select('*')
                .in('route_template_day_id', dayIds);
            if (actsError) fail(actsError);
            activities = acts || [];
        }

        return routes.map(function (route) {
            const routeDays = (days || [])
                .filter(function (d) { return d.route_template_id === route.id; })
                .map(function (d) {
                    return Object.assign({}, d, {
                        route_template_activities: activities.filter(function (a) {
                            return a.route_template_day_id === d.id;
                        }),
                    });
                });
            return sortRouteContents(Object.assign({}, route, { route_template_days: routeDays }));
        });
    }

    return {
        client: client,
        listCities: listCities,
        getCityById: getCityById,
        getCityByName: getCityByName,
        listPlaces: listPlaces,
        currentUserId: currentUserId,
        createPlace: createPlace,
        deletePlace: deletePlace,
        listRoutes: listRoutes,
    };
})();
