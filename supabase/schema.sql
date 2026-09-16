-- Nowhere Fast — схема данных
--
-- Структура была реконструирована по запросам в коде, а 16.09.2026 СВЕРЕНА
-- с живой базой через MCP-коннектор Supabase. Совпало всё, кроме двух вещей:
--
--   1. В базе были четыре таблицы, которых здесь нет: users (с password_hash),
--      trips, trip_activities, trip_packing. Пустые, кодом не использовались,
--      УДАЛЕНЫ 16.09.2026 — см. supabase/cleanup-legacy.sql.
--   2. Поля и ограничения, объявленные ВНУТРИ create table if not exists для
--      таблиц, которые уже существовали, в базу не попали: для созданной таблицы
--      этот оператор не делает ничего. Они добавлены отдельным блоком в конце файла.
--
-- Отсюда правило на будущее: в аддитивной миграции ограничение существующей
-- таблицы добавляется только через alter table ... add constraint.
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
    country     text,
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

-- Имя города используется в ссылках и в поиске, дубликаты ломают выборку .single()
create unique index if not exists cities_name_key on public.cities (lower(name));

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

    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint places_lat_range   check (lat between -90 and 90),
    constraint places_lng_range   check (lng between -180 and 180),
    constraint places_source_known check (source in ('manual', 'map', 'author', 'ai')),
    constraint places_price_range check (price_level is null or price_level between 0 and 4),
    constraint places_visit_positive check (visit_minutes is null or visit_minutes > 0)
);

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
    days_count  integer,
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
    name                 text,
    description          text,
    location             text,
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
