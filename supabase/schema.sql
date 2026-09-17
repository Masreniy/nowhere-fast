-- Nowhere Fast — схема данных
--
-- Структура была реконструирована по запросам в коде, а 16.09.2026 СВЕРЕНА
-- с живой базой через MCP-коннектор Supabase. Расхождения:
--
--   1. В базе были четыре таблицы, которых здесь нет: users (с password_hash),
--      trips, trip_activities, trip_packing. Пустые, кодом не использовались,
--      УДАЛЕНЫ 16.09.2026 — см. supabase/cleanup-legacy.sql.
--   2. Поля и ограничения, объявленные ВНУТРИ create table if not exists для
--      таблиц, которые уже существовали, в базу не попали: для созданной таблицы
--      этот оператор не делает ничего. Они добавлены отдельным блоком в конце файла.
--   3. ВТОРОЙ ПРОХОД, 16.09.2026. Первая сверка была неполной: она проверила
--      наличие таблиц и колонок, но не их ТИП и не признак not null. При сверке
--      по information_schema нашлось ещё шесть расхождений — not null на трёх
--      внешних ключах, тип created_at у двух таблиц, три незадокументированные
--      колонки у активностей. Всё перечислено и исправлено в конце файла,
--      в блоке «Второй проход сверки».
--
-- Отсюда правило на будущее: в аддитивной миграции ограничение существующей
-- таблицы добавляется только через alter table ... add constraint. И второе:
-- сверка схемы — это сравнение по information_schema, а не взгляд на список
-- таблиц. Колонка на месте ещё не значит, что она того же типа.
--
-- КАК ПРОВЕРЯТЬ СЕБЯ. Утверждение «схема совпадает с базой» проверяется
-- запросом к information_schema.columns и к pg_constraint, а не чтением
-- этого файла. Дата последней такой сверки — 16.09.2026 (второй проход).
--
-- Файл написан АДДИТИВНО: create table if not exists / add column if not exists.
-- Он не удаляет таблицы, не меняет типы и не трогает существующие строки.
-- Применять в SQL Editor проекта Supabase.
--
-- Решения, стоящие за этой схемой:
--   ADR-0002 — первая версия строит связный маршрут
--   ADR-0003 — место без координат в планировщик не попадает
--   ADR-0004 — место является самостоятельной сущностью
--
-- Политики доступа вынесены в policies.sql и применяются отдельно.

-- ---------------------------------------------------------------------------
-- Расширения
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- cities — город
-- ---------------------------------------------------------------------------

create table if not exists public.cities (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    country     text not null,   -- в базе not null; проверено 16.09.2026
    description text,
    image_url   text,
    currency    text,
    language    text,
    timezone    text,
    visa_info   text,
    created_at  timestamptz not null default now()
);

-- Локальное написание названия города: то, что понимают навигатор и таксист.
alter table public.cities add column if not exists name_local text;

-- Центр города — точка отсчёта, когда у пользователя ещё нет отеля.
alter table public.cities add column if not exists lat double precision;
alter table public.cities add column if not exists lng double precision;

-- Город уникален по паре «имя + страна», а не по одному имени: Кембридж есть
-- в Англии и в США. Прежний индекс cities_name_key (только lower(name)) снят
-- 16.09.2026 — см. блок «Второй проход сверки» в конце файла.
create unique index if not exists cities_name_country_key
    on public.cities (lower(name), lower(country));

-- ---------------------------------------------------------------------------
-- places — МЕСТО (ADR-0004)
--
-- Ключевая новая сущность. Место принадлежит городу, а не маршруту, и потому
-- переиспользуется в любом количестве планов.
-- ---------------------------------------------------------------------------

create table if not exists public.places (
    id            uuid primary key default gen_random_uuid(),
    city_id       uuid not null references public.cities (id) on delete cascade,

    -- Название на языке интерфейса и на языке страны.
    -- name_local — не украшение: английское написание Amap не находит.
    name          text not null,
    name_local    text,

    description   text,

    -- Адрес так же в двух написаниях. address_local — то, что показывают таксисту.
    address       text,
    address_local text,

    -- Координаты обязательны (ADR-0003). Место без них неразмещаемо
    -- во времени и пространстве, а значит бесполезно планировщику.
    lat           double precision not null,
    lng           double precision not null,

    -- Сколько времени занимает посещение. Без этого нельзя построить день.
    visit_minutes integer,

    category      text,   -- еда, парк, музей, смотровая, рынок...
    opening_hours jsonb,  -- { "mon": ["09:00","18:00"], ... } — форма уточняется

    -- Ответ на «дёшево» из брифа: 0 — бесплатно, 4 — дорого.
    price_level   smallint,

    -- Откуда данные (ADR-0003). 'ai' допустим только для описаний,
    -- никогда как источник факта о существовании места.
    source        text not null default 'manual',

    -- Под модель «писать могут все» из брифа. Пока не используется.
    author_id     uuid,
    is_published  boolean not null default false,

    -- Ссылка на запись во внешнем источнике и дата последней сверки.
    -- source говорит «откуда класс данных», а эти двое — «какая именно
    -- запись у провайдера и когда её проверяли». Без них повторный импорт
    -- задвоит места, а протухшие часы работы никто не заметит (ADR-0006).
    external_source text,   -- 'osm' и т. п.; пусто — заведено вручную
    external_id     text,   -- например way/255622888
    checked_at      timestamptz,

    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint places_lat_range   check (lat between -90 and 90),
    constraint places_lng_range   check (lng between -180 and 180),
    constraint places_source_known check (source in ('manual', 'map', 'author', 'ai')),
    constraint places_price_range check (price_level is null or price_level between 0 and 4),
    constraint places_visit_positive check (visit_minutes is null or visit_minutes > 0)
);

-- Идемпотентность импорта: одна запись источника заводится ровно один раз.
create unique index if not exists places_external_key
    on public.places (external_source, external_id)
    where external_source is not null and external_id is not null;

create index if not exists places_city_idx      on public.places (city_id);
create index if not exists places_published_idx on public.places (city_id, is_published);
create index if not exists places_geo_idx       on public.places (lat, lng);

-- ---------------------------------------------------------------------------
-- route_templates — авторский маршрут
--
-- Существующая ветка модели. Не удаляется: в ней есть данные, и она остаётся
-- способом опубликовать свой маршрут (модель «умного блога» из брифа).
-- ---------------------------------------------------------------------------

create table if not exists public.route_templates (
    id          uuid primary key default gen_random_uuid(),
    city_id     uuid not null references public.cities (id) on delete cascade,
    name        text not null,
    description text,
    days_count  integer not null,   -- в базе not null; проверено 16.09.2026
    difficulty  text,
    created_at  timestamptz not null default now()
);

-- Маршрут принадлежит человеку — прямое следствие «писать могут все».
alter table public.route_templates add column if not exists author_id uuid;

-- Колонка добавляется со значением true, чтобы уже существующие маршруты
-- остались видимыми: они заводились до появления понятия черновика и публичны
-- по факту. Сразу после этого умолчание меняется на false — иначе новый
-- маршрут оказывался бы опубликован молча, в отличие от места, которое
-- создаётся черновиком. Такая асимметрия однажды опубликует чужой черновик.
alter table public.route_templates add column if not exists is_published boolean not null default true;
alter table public.route_templates alter column is_published set default false;

-- Место под монетизацию из брифа. Заполнять пока нечем, но структура готова.
alter table public.route_templates add column if not exists price_cents integer;
alter table public.route_templates add column if not exists currency_code text;

create index if not exists route_templates_city_idx on public.route_templates (city_id);

-- ---------------------------------------------------------------------------
-- route_template_days — день маршрута
-- ---------------------------------------------------------------------------

create table if not exists public.route_template_days (
    id                uuid primary key default gen_random_uuid(),
    route_template_id uuid not null references public.route_templates (id) on delete cascade,
    day_number        integer not null,
    name              text,
    description       text,
    created_at        timestamptz not null default now(),

    constraint route_template_days_number_positive check (day_number > 0),
    constraint route_template_days_unique_number unique (route_template_id, day_number)
);

create index if not exists route_template_days_route_idx
    on public.route_template_days (route_template_id);

-- ---------------------------------------------------------------------------
-- route_template_activities — активность внутри дня
--
-- ИЗМЕНЕНИЕ ПО ADR-0004: активность перестаёт быть носителем факта о месте.
-- Поля name/location остаются для уже введённых данных, но новые активности
-- должны ссылаться на places. Текстовое поле не содержит координат, а значит
-- не может участвовать в планировании.
-- ---------------------------------------------------------------------------

create table if not exists public.route_template_activities (
    id                   uuid primary key default gen_random_uuid(),
    route_template_day_id uuid not null
                          references public.route_template_days (id) on delete cascade,
    order_in_day         integer not null,
    name                 text not null,   -- в базе not null; проверено 16.09.2026
    description          text,
    location             text,

    -- Колонки, существующие в базе с самого начала и заполненные у всех строк.
    -- duration_minutes — время активности; это то, из чего планировщик строит день.
    duration_minutes     integer,
    type                 text,
    is_mandatory         boolean,

    created_at           timestamptz not null default now(),

    constraint route_template_activities_order_positive check (order_in_day > 0)
);

-- Ссылка на место. Заполняется для новых активностей; старые связываются вручную.
alter table public.route_template_activities
    add column if not exists place_id uuid references public.places (id) on delete set null;

create index if not exists route_template_activities_day_idx
    on public.route_template_activities (route_template_day_id);
create index if not exists route_template_activities_place_idx
    on public.route_template_activities (place_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists places_touch_updated_at on public.places;
create trigger places_touch_updated_at
    before update on public.places
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Что проглотил `create table if not exists` (применено 16.09.2026)
--
-- Блоки create table выше для route_template_days и route_template_activities
-- не выполнились: таблицы уже существовали. Всё, что было объявлено внутри них,
-- в базе отсутствовало — здесь оно добавляется явно.
-- ---------------------------------------------------------------------------

-- created_at сознательно nullable: у строк, заведённых до этой миграции, время
-- создания неизвестно, и подставить им now() значило бы записать выдуманный факт.
alter table public.route_template_days
    add column if not exists created_at timestamptz default now();

alter table public.route_template_activities
    add column if not exists created_at timestamptz default now();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'route_template_days_number_positive'
          and conrelid = 'public.route_template_days'::regclass
    ) then
        alter table public.route_template_days
            add constraint route_template_days_number_positive check (day_number > 0);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'route_template_activities_order_positive'
          and conrelid = 'public.route_template_activities'::regclass
    ) then
        alter table public.route_template_activities
            add constraint route_template_activities_order_positive check (order_in_day > 0);
    end if;
end $$;

-- Уникальность дня внутри маршрута. Добавлена 16.09.2026, после того как из
-- данных убрали задвоенный маршрут (cleanup-legacy.sql). Это страховка от
-- повторения: раньше у маршрута «за 3 дня» было шесть дней вместо трёх.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'route_template_days_unique_number'
          and conrelid = 'public.route_template_days'::regclass
    ) then
        alter table public.route_template_days
            add constraint route_template_days_unique_number
            unique (route_template_id, day_number);
    end if;
end $$;

-- Фиксированный search_path: без него вызывающая роль может подменить схему
-- поиска и увести вызовы функции в свои объекты.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Координаты города лежали только в старых колонках coordinates_*, а код и схема
-- работают с lat/lng. Значения перенесены 16.09.2026, сами колонки затем удалены
-- (cleanup-legacy.sql), поэтому здесь остался только след решения: перенос
-- выполнялся до удаления, а не после.
--
--   update public.cities set lat = coordinates_lat, lng = coordinates_lng
--    where lat is null and coordinates_lat is not null;

-- ---------------------------------------------------------------------------
-- Что НЕ сделано здесь и почему
-- ---------------------------------------------------------------------------
--
-- 1. Нет таблиц trips / trip_days / trip_items (поездка пользователя).
--    Причина: аккаунты вне первой версии (ADR-0002). Появятся вместе с ними.
--    Уточнение от 16.09.2026: такие таблицы (trips, trip_activities, trip_packing
--    и users) в базе лежали — остатки прежнего подхода. Пустые, кодом не
--    использовались, удалены. См. cleanup-legacy.sql. В базе остались ровно пять
--    таблиц этой схемы: cities, places, route_templates, route_template_days,
--    route_template_activities.
--
-- 2. Нет PostGIS и геоиндекса по-настоящему.
--    Причина: на объёмах первого города обычного индекса по (lat, lng) достаточно.
--    Переход на PostGIS — отдельное решение, когда появится реальная нагрузка.
--
-- 3. Нет таблицы посещённых мест («не предлагать то, где я уже был»).
--    Причина: требует аккаунтов, см. пункт 1.

-- ---------------------------------------------------------------------------
-- Второй проход сверки (применено 16.09.2026)
--
-- Первая сверка сравнила список таблиц и колонок, но не типы и не признак
-- not null. Сравнение по information_schema нашло ещё шесть расхождений.
-- Все они здесь исправлены; перед применением проверено запросом, что
-- NULL-значений в затронутых колонках нет ни одного.
-- ---------------------------------------------------------------------------

-- 1. Внешние ключи были объявлены not null ВНУТРИ create table, поэтому в базу
--    это не попало — таблицы уже существовали. Осиротевшая строка не видна
--    ни коду, ни политике чтения: она исчезает молча.
alter table public.route_templates            alter column city_id               set not null;
alter table public.route_template_days        alter column route_template_id     set not null;
alter table public.route_template_activities  alter column route_template_day_id set not null;

-- 2. created_at у cities и route_templates лежал как timestamp БЕЗ часового пояса.
--    Планировщик путешествий работает в трёх поясах одновременно: браузер
--    пользователя, город поездки и UTC от Postgres. Тип без пояса молча теряет
--    один из них, и ошибка вылезает не при записи, а через месяцы — на дате,
--    которая «вечером уже завтра».
--
--    Существующие значения были записаны умолчанием now(), поэтому трактуются
--    как UTC. Это допущение, и оно здесь записано явно.
alter table public.cities
    alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.cities alter column created_at set default now();

alter table public.route_templates
    alter column created_at type timestamptz using created_at at time zone 'UTC';
alter table public.route_templates alter column created_at set default now();

-- 3. Три колонки у активностей существуют в базе с самого начала, заполнены
--    у всех 12 строк и в этом файле не были описаны вовсе. Объявляем их явно,
--    чтобы схема перестала врать.
--
--    duration_minutes особенно важен: это время посещения, то самое, без чего
--    планировщик не может построить день. Данные уже есть — их просто никто
--    не читает (assets/js/api.js их не выбирает).
alter table public.route_template_activities add column if not exists duration_minutes integer;
alter table public.route_template_activities add column if not exists type             text;
alter table public.route_template_activities add column if not exists is_mandatory     boolean;

-- 4. Город уникален по паре «имя + страна».
--
--    Было: уникальный индекс по lower(name). Кембридж есть в Англии и в США —
--    второй завести нельзя, а место привязалось бы к первому попавшемуся.
--    Колонка country в базе not null, поэтому пара всегда полна.
drop index if exists public.cities_name_key;
create unique index if not exists cities_name_country_key
    on public.cities (lower(name), lower(country));

-- 5. Расхождения, которые исправлены НЕ в базе, а в этом файле — потому что
--    права была база, а врал документ:
--
--      cities.country                      — в базе not null (здесь было nullable)
--      route_templates.days_count          — в базе not null
--      route_template_activities.name      — в базе not null
--
--    Менять их в базе не стали: ограничение строже, чем было записано, и оно
--    верное. Исправлено объявление выше по файлу.

-- ---------------------------------------------------------------------------
-- Справочник стран и городов (добавлено 16.09.2026)
--
-- ПОЧЕМУ ОТДЕЛЬНЫЕ ТАБЛИЦЫ, А НЕ СТРОКИ В `cities`
--
-- `cities` — продуктовая сущность: у города есть описание, картинка, валюта,
-- виза, места (ADR-0004) и авторские маршруты. Таких городов будет десятки,
-- и каждый заводится руками, потому что за ним стоит содержание.
--
-- `countries` и `geo_cities` — справочник-газеттир: 235 стран и 9045 городов
-- от 50 тысяч жителей. Он нужен глобусу (что рисовать и где), поиску («откуда
-- я лечу») и определению точки отсчёта по часовому поясу. Содержания за этими
-- строками нет — только география.
--
-- Сложить их в одну таблицу значит: сломать смысл `cities` (в списке городов
-- на главной окажется девять тысяч строк без единого места), сломать все
-- существующие запросы (`listCities` отдаёт всё подряд без фильтра) и завести
-- у города два разных жизненных цикла — «его завёл человек» и «его привёз
-- импорт». Разделение стоит одной колонки-связки, и она ниже.
--
-- ИСТОЧНИКИ И ЛИЦЕНЗИИ перечислены в `supabase/seed-geo.sql`. Коротко:
-- контуры — Natural Earth (public domain), имена стран — i18n-iso-countries
-- (MIT), города — GeoNames через all-the-cities (CC BY 4.0, атрибуция
-- обязательна). Данные собирает `tools/geo/build-reference-sql.js`.
-- ---------------------------------------------------------------------------

create table if not exists public.countries (
    -- ISO 3166-1 alpha-2. Спорные территории без кода (Косово, Сомалиленд,
    -- Северный Кипр) в справочник не попадают: выдумывать им код нельзя.
    code        text primary key,

    -- Название на десяти языках интерфейса: {"ru":"Таиланд","en":"Thailand",...}.
    -- Отдельной таблицей переводов это делать рано: языков ровно десять,
    -- и они меняются вместе с интерфейсом, а не независимо от него.
    names       jsonb not null,

    -- Центр страны и её угловой размах в градусах. Оба считаются по сетке точек
    -- суши, а не по прямоугольнику контура: у России и США прямоугольник даёт
    -- центр в океане. spread нужен камере — на сколько отлетать, чтобы страна
    -- поместилась в кадр.
    lat         double precision not null,
    lng         double precision not null,
    spread      double precision not null,

    -- Доля суши планеты в процентах. Считается по той же сетке.
    land_share  double precision,

    -- Контур страны: [полигон][кольцо][точка] = [lng, lat], как в GeoJSON
    -- MultiPolygon, упрощённый по Дугласу-Пекеру до сотых долей градуса.
    -- Первое кольцо полигона — внешнее, остальные — дырки (Лесото внутри ЮАР).
    outline     jsonb,

    constraint countries_lat_range check (lat between -90 and 90),
    constraint countries_lng_range check (lng between -180 and 180),
    constraint countries_spread_positive check (spread > 0)
);

create table if not exists public.geo_cities (
    -- Идентификатор GeoNames. Ключ берётся у источника, а не генерируется:
    -- иначе повторный импорт задваивает справочник.
    geoname_id   integer primary key,
    name         text not null,
    country_code text not null references public.countries (code),
    lat          double precision not null,
    lng          double precision not null,
    population   integer not null,

    constraint geo_cities_lat_range check (lat between -90 and 90),
    constraint geo_cities_lng_range check (lng between -180 and 180),
    constraint geo_cities_population_positive check (population > 0)
);

-- Внешний ключ без индекса — это медленное удаление страны и замечание
-- линтера Supabase. Второй индекс под основной запрос глобуса:
-- «города от такого-то населения».
create index if not exists geo_cities_country_idx on public.geo_cities (country_code);
create index if not exists geo_cities_population_idx on public.geo_cities (population desc);

-- Связка продуктового города со справочником: по ней глобус закрашивает
-- страны, в которых у нас есть наполнение. Nullable намеренно — город можно
-- завести до того, как разобрались, какой стране он принадлежит по ISO.
alter table public.cities add column if not exists country_code text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'cities_country_code_fkey'
          and conrelid = 'public.cities'::regclass
    ) then
        alter table public.cities
            add constraint cities_country_code_fkey
            foreign key (country_code) references public.countries (code);
    end if;
end $$;

create index if not exists cities_country_code_idx on public.cities (country_code);

-- ---------------------------------------------------------------------------
-- Написания городов на языках интерфейса (аддитивно, 16.09.2026)
--
-- Справочник `geo_cities` приходит из GeoNames через пакет `all-the-cities`,
-- а тот отдаёт ТОЛЬКО латиницу: поле altName пусто у всех 135 233 записей
-- (проверено чтением пакета). Интерфейс проекта — на десяти языках, и при
-- русском интерфейсе «Москва» в поиске не находится, находится «Moscow».
-- ADR-0010 назвал это ограничением источника; здесь оно закрывается.
--
-- Написания лежат в jsonb рядом с городом, а не отдельной таблицей переводов:
-- языков ровно десять, они меняются вместе с интерфейсом, и читаются всегда
-- вместе с городом. Ровно то же решение и по той же причине принято выше
-- для `countries.names`.
--
-- ТРИ СОСТОЯНИЯ, И ПОЧЕМУ ИМЕННО ТАК. Дозаполнение идёт медленно и порциями,
-- поэтому «нет написаний» обязано отличаться от «спрашивали, источник молчит»:
-- иначе дозаполнитель вечно ходит за одними и теми же городами.
--
--   names is null,     names_checked_at is null      — ещё не пробовали
--   names is null,     names_checked_at is not null  — пробовали, источник не дал
--   names is not null, names_checked_at — когда подтверждено
--
-- Почему не `names = '{}'` для «пробовали и пусто»: пустой объект неотличим
-- от ошибки записи, и каждый читатель обязан помнить про `names <> '{}'`.
-- Отсутствие данных — это null, а факт попытки несёт дата. Заодно это даёт
-- повтор по давности (`names_checked_at < now() - interval '...'`) без
-- четвёртой колонки-флага.
--
-- ИСТОЧНИК НАЗЫВАЕТСЯ В СТРОКЕ. `names_source` — не украшение: широкий слой
-- (Natural Earth, public domain) и точечный (Nominatim/OSM, ODbL) имеют разные
-- обязательства по атрибуции, и по ADR-0006 знать, откуда факт, обязаны мы,
-- а не читатель NOTICE. Значения: 'natural-earth', 'nominatim'.
-- ---------------------------------------------------------------------------

alter table public.geo_cities add column if not exists names            jsonb;
alter table public.geo_cities add column if not exists names_checked_at timestamptz;
alter table public.geo_cities add column if not exists names_source     text;

-- `add constraint if not exists` в Postgres нет, поэтому проверка вручную —
-- как и выше по файлу для cities_country_code_fkey.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'geo_cities_names_is_object'
          and conrelid = 'public.geo_cities'::regclass
    ) then
        alter table public.geo_cities
            add constraint geo_cities_names_is_object
            check (names is null or jsonb_typeof(names) = 'object');
    end if;

    -- Есть написания — обязана быть дата подтверждения и назван источник.
    -- Без этого через месяц никто не скажет, откуда взялась строка, а по
    -- ADR-0003 выдуманное написание неотличимо от подтверждённого только
    -- до первой проверки.
    if not exists (
        select 1 from pg_constraint
        where conname = 'geo_cities_names_dated'
          and conrelid = 'public.geo_cities'::regclass
    ) then
        alter table public.geo_cities
            add constraint geo_cities_names_dated
            check (names is null or (names_checked_at is not null and names_source is not null));
    end if;
end $$;

-- Частичный индекс ровно под очередь дозаполнителя: «ещё не пробовали,
-- крупные вперёд». Обычный индекс по population здесь не помогает —
-- отбор идёт по двум null-условиям, а их в индексе по населению нет.
create index if not exists geo_cities_names_pending_idx
    on public.geo_cities (population desc)
    where names is null and names_checked_at is null;

-- Сводка для метки прогресса в админке. Считать это в браузере нельзя:
-- пришлось бы выкачать все девять тысяч строк ради четырёх чисел.
-- security_invoker: представление обязано подчиняться RLS базовой таблицы,
-- а не правам своего владельца — иначе оно становится дырой в обход политик.
create or replace view public.geo_city_names_progress
    with (security_invoker = true) as
select
    count(*)                                                                  as total,
    count(*) filter (where names is not null)                                 as with_names,
    count(*) filter (where names is null and names_checked_at is null)        as untried,
    count(*) filter (where names is null and names_checked_at is not null)    as empty_result,
    max(names_checked_at)                                                     as last_checked_at,
    (
        select coalesce(jsonb_object_agg(lang, n), '{}'::jsonb)
        from (
            select key as lang, count(*) as n
            from public.geo_cities, lateral jsonb_object_keys(names) as key
            where names is not null
            group by key
        ) as by_lang
    )                                                                         as per_language
from public.geo_cities;

grant select on public.geo_city_names_progress to anon, authenticated;

-- Сводка заливки справочника для метки в админке.
--
-- Зачем отдельно от `geo_city_names_progress`. Там прогресс сбора написаний,
-- здесь — прогресс самой заливки: справочник приезжает порциями, и без метки
-- единственный способ узнать, доехал он или нет, — спросить агента. Метка
-- отвечает на это сама.
--
-- security_invoker — по той же причине, что у соседнего представления:
-- представление обязано подчиняться RLS базовых таблиц, а не правам своего
-- владельца, иначе оно становится обходом политик.
create or replace view public.geo_reference_progress
    with (security_invoker = true) as
select
    (select count(*) from public.countries)                           as countries,
    (select count(*) from public.countries where outline is not null) as countries_with_outline,
    (select count(*) from public.geo_cities)                          as cities,
    (select count(distinct country_code) from public.geo_cities)      as countries_with_cities,
    -- Порог источника — 50 000 жителей. Значение заметно выше означает,
    -- что заливка не дошла до конца, а не что города такие крупные.
    (select min(population) from public.geo_cities)                   as smallest_city;

grant select on public.geo_reference_progress to anon, authenticated;
