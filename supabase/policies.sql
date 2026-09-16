-- Nowhere Fast — политики доступа (RLS)
--
-- ПРИМЕНЕНО. Файл повторяет состояние живой базы и запускается повторно
-- без последствий: все операторы идемпотентны.
--
-- История, чтобы решение не переоткрывали:
--
--   16.09.2026 базу впервые посмотрели напрямую через MCP-коннектор Supabase.
--   Оказалось, что RLS был включён и до этого файла, но политик было четыре,
--   все на чтение и все `using (true)` — заведены руками через интерфейс.
--   Черновики были видны всем, а у places не было НИ ОДНОЙ политики при
--   включённом RLS, то есть места не читались и не писались вообще.
--   Политик на запись не было нигде: писать не мог никто. Ручные политики сняты
--   блоком ниже — разрешения складываются по ИЛИ, и пока жива `using (true)`,
--   строгая политика рядом не ограничивает ничего. См. ADR-0005.
--
-- Следствие для админки: admin.html писать не может, и не мог раньше.
-- Запись откроется вместе с Supabase Auth; до тех пор данные заводятся
-- через интерфейс Supabase.
--
-- Схема (schema.sql) от этого файла не зависит и применяется отдельно.
--
-- Почему auth.uid() везде обёрнут в (select ...): без обёртки функция
-- вычисляется заново для каждой строки. С обёрткой — один раз на запрос.
-- Почему нет политик `for all`: `for all` включает и select, из-за чего
-- у вошедшего пользователя срабатывали две политики чтения вместо одной.

-- ---------------------------------------------------------------------------
-- Снимаем ручные политики, заведённые через интерфейс
-- ---------------------------------------------------------------------------

drop policy if exists "Allow public read cities"           on public.cities;
drop policy if exists "Allow public read routes"           on public.route_templates;
drop policy if exists "Allow public read route_days"       on public.route_template_days;
drop policy if exists "Allow public read route_activities" on public.route_template_activities;

-- ---------------------------------------------------------------------------
-- Включаем RLS
--
-- Без этого политики ниже не имеют силы: при выключенном RLS таблица открыта
-- целиком всем, у кого есть публичный ключ.
-- ---------------------------------------------------------------------------

alter table public.cities                    enable row level security;
alter table public.places                    enable row level security;
alter table public.route_templates           enable row level security;
alter table public.route_template_days       enable row level security;
alter table public.route_template_activities enable row level security;

-- ---------------------------------------------------------------------------
-- Почему здесь НЕТ `force row level security` — решение, а не забывчивость
--
-- `enable` не действует на владельца таблицы: подключившись под владельцем,
-- политики можно обойти. `force` это закрывает, и в зрелых проектах он стоит
-- рядом с каждым `enable`.
--
-- У нас он сейчас НЕ ставится по одной причине: из браузера сайт ходит под
-- ролями anon и authenticated, которые владельцами таблиц не являются — от них
-- защищает уже `enable`. А единственный работающий способ завести данные, пока
-- нет входа, — интерфейс Supabase и MCP-коннектор, то есть привилегированное
-- подключение. Включив `force` сегодня, мы закрыли бы не дыру, а собственную
-- дверь: наполнять базу стало бы нечем.
--
-- Порог, на котором это меняется: появился Supabase Auth и запись из админки.
-- Тогда `force` ставится на все пять таблиц, и служебная запись идёт через
-- отдельную роль с явной политикой, а не в обход политик.
--
-- Проверено 16.09.2026 запросом к pg_class: relforcerowsecurity = false
-- у всех пяти таблиц. Это ожидаемое состояние, а не расхождение.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Чтение — публичное
--
-- Сайт статический и ходит в базу анонимно, поэтому читать должно быть можно
-- без входа. Но только опубликованное: черновик автора виден только автору.
-- ---------------------------------------------------------------------------

drop policy if exists cities_read_all on public.cities;
create policy cities_read_all
    on public.cities for select
    using (true);

drop policy if exists places_read_published on public.places;
create policy places_read_published
    on public.places for select
    using (is_published or (select auth.uid()) = author_id);

drop policy if exists route_templates_read_published on public.route_templates;
create policy route_templates_read_published
    on public.route_templates for select
    using (is_published or (select auth.uid()) = author_id);

-- Дни и активности видны, если виден их маршрут.
drop policy if exists route_template_days_read on public.route_template_days;
create policy route_template_days_read
    on public.route_template_days for select
    using (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id
              and (rt.is_published or (select auth.uid()) = rt.author_id)
        )
    );

drop policy if exists route_template_activities_read on public.route_template_activities;
create policy route_template_activities_read
    on public.route_template_activities for select
    using (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id
              and (rt.is_published or (select auth.uid()) = rt.author_id)
        )
    );

-- ---------------------------------------------------------------------------
-- Запись
--
-- Анонимной записи нет ни в одной таблице. Политик для роли anon не создаётся
-- вовсе — при включённом RLS отсутствие политики означает запрет.
--
-- Справочник городов правит только администратор проекта: по брифу админка —
-- внутренняя система, а не публичный интерфейс авторов. Роль администратора
-- ещё не заведена, поэтому запись в cities закрыта полностью и открывается
-- вместе с Supabase Auth.
-- ---------------------------------------------------------------------------

-- Места и маршруты: автор владеет своими записями.
-- Это и есть «писать могут все» из брифа, выраженное в правах.

drop policy if exists places_insert_own on public.places;
create policy places_insert_own
    on public.places for insert
    to authenticated
    with check ((select auth.uid()) = author_id);

drop policy if exists places_update_own on public.places;
create policy places_update_own
    on public.places for update
    to authenticated
    using ((select auth.uid()) = author_id)
    with check ((select auth.uid()) = author_id);

drop policy if exists places_delete_own on public.places;
create policy places_delete_own
    on public.places for delete
    to authenticated
    using ((select auth.uid()) = author_id);

drop policy if exists route_templates_insert_own on public.route_templates;
create policy route_templates_insert_own
    on public.route_templates for insert
    to authenticated
    with check ((select auth.uid()) = author_id);

drop policy if exists route_templates_update_own on public.route_templates;
create policy route_templates_update_own
    on public.route_templates for update
    to authenticated
    using ((select auth.uid()) = author_id)
    with check ((select auth.uid()) = author_id);

drop policy if exists route_templates_delete_own on public.route_templates;
create policy route_templates_delete_own
    on public.route_templates for delete
    to authenticated
    using ((select auth.uid()) = author_id);

-- Дни маршрута правит владелец маршрута.
-- Снимаем прежнюю политику `for all`, если она осталась от ранней версии файла.

drop policy if exists route_template_days_write_own on public.route_template_days;

drop policy if exists route_template_days_insert_own on public.route_template_days;
create policy route_template_days_insert_own
    on public.route_template_days for insert
    to authenticated
    with check (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = (select auth.uid())
        )
    );

drop policy if exists route_template_days_update_own on public.route_template_days;
create policy route_template_days_update_own
    on public.route_template_days for update
    to authenticated
    using (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = (select auth.uid())
        )
    );

drop policy if exists route_template_days_delete_own on public.route_template_days;
create policy route_template_days_delete_own
    on public.route_template_days for delete
    to authenticated
    using (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = (select auth.uid())
        )
    );

-- Активности правит владелец маршрута, которому принадлежит день.

drop policy if exists route_template_activities_write_own on public.route_template_activities;

drop policy if exists route_template_activities_insert_own on public.route_template_activities;
create policy route_template_activities_insert_own
    on public.route_template_activities for insert
    to authenticated
    with check (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = (select auth.uid())
        )
    );

drop policy if exists route_template_activities_update_own on public.route_template_activities;
create policy route_template_activities_update_own
    on public.route_template_activities for update
    to authenticated
    using (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = (select auth.uid())
        )
    )
    with check (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = (select auth.uid())
        )
    );

drop policy if exists route_template_activities_delete_own on public.route_template_activities;
create policy route_template_activities_delete_own
    on public.route_template_activities for delete
    to authenticated
    using (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = (select auth.uid())
        )
    );

-- ---------------------------------------------------------------------------
-- Как проверить, что политики работают
-- ---------------------------------------------------------------------------
--
-- 1. Открой сайт в браузере без входа — города и опубликованные места видны.
-- 2. В консоли браузера выполни:
--        await supabase.from('cities').insert({ name: 'Тест', country: 'Тест' })
--    Должна вернуться ошибка нарушения политики. Если строка добавилась —
--    политики сняты или RLS выключен, и данные открыты всем.
-- 3. Повтори пункт 2 для places и route_templates.
--
-- Проверка со стороны базы (pg_policies и линтер Supabase) сделана: отчёт
-- по безопасности пуст. Проверка ИЗ БРАУЗЕРА не делалась — сеть рабочей среды
-- до *.supabase.co закрыта политикой окружения. Пункты 1–3 ждут владельца.

-- ---------------------------------------------------------------------------
-- Справочник стран и городов (добавлено 16.09.2026)
--
-- Читают все и без входа: справочник нужен глобусу до того, как человек хоть
-- что-то выбрал, и ничего личного в нём нет — это география, а не содержание
-- сайта. Скрывать её не от кого.
--
-- Пишет никто. Справочник приходит из источников целиком и заменяется целиком
-- через `tools/geo/build-reference-sql.js` и привилегированное подключение
-- (интерфейс Supabase или MCP-коннектор). Правка одной страны руками из
-- браузера расходится с источником молча — и это будет видно только как
-- кривой контур на глобусе. Политик на insert/update/delete нет вовсе:
-- при включённом RLS отсутствие политики означает запрет.
--
-- `force row level security` не ставится и здесь — по той же причине, что
-- и у пяти таблиц выше: справочник заводится привилегированным подключением,
-- и `force` закрыл бы единственную работающую дверь. Таблиц под RLS теперь
-- семь, а не пять.
-- ---------------------------------------------------------------------------

alter table public.countries  enable row level security;
alter table public.geo_cities enable row level security;

drop policy if exists countries_read_all on public.countries;
create policy countries_read_all
    on public.countries for select
    using (true);

drop policy if exists geo_cities_read_all on public.geo_cities;
create policy geo_cities_read_all
    on public.geo_cities for select
    using (true);
