-- Nowhere Fast — политики доступа (RLS)
--
-- ПРИМЕНЕНО 16.09.2026. Файл повторяет состояние живой базы и может быть
-- запущен повторно: все операторы идемпотентны.
--
-- Что оказалось на деле, когда базу наконец посмотрели через MCP-коннектор:
--
--   * RLS был включён на всех таблицах и до этого файла;
--   * политик было четыре, все на чтение, все `using (true)`, заведены руками
--     через интерфейс Supabase. Они показывали в том числе черновики;
--   * политик на запись не было ни одной, то есть записи не было ни у кого,
--     а не «у всех», как было записано в документах;
--   * у places не было НИ ОДНОЙ политики при включённом RLS — то есть места
--     не читались и не писались вообще. Основная сущность продукта была недоступна.
--
-- Ручные политики сняты блоком ниже: разрешения складываются по ИЛИ, и пока
-- `using (true)` жива, любая более строгая политика рядом ничего не ограничивает.
--
-- Следствие для админки: admin.html писать не может и сейчас. Это не регресс от
-- применения файла — записи не было и раньше. Админка заработает вместе с
-- Supabase Auth; до тех пор данные заводятся через интерфейс Supabase.
--
-- Схема (schema.sql) от этого файла не зависит и применяется отдельно.

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
    using (is_published or auth.uid() = author_id);

drop policy if exists route_templates_read_published on public.route_templates;
create policy route_templates_read_published
    on public.route_templates for select
    using (is_published or auth.uid() = author_id);

-- Дни и активности видны, если виден их маршрут.
drop policy if exists route_template_days_read on public.route_template_days;
create policy route_template_days_read
    on public.route_template_days for select
    using (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id
              and (rt.is_published or auth.uid() = rt.author_id)
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
              and (rt.is_published or auth.uid() = rt.author_id)
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
-- ещё не заведена, поэтому запись в cities сейчас закрыта полностью и
-- открывается вместе с Supabase Auth.
-- ---------------------------------------------------------------------------

-- Места и маршруты: автор владеет своими записями.
-- Это и есть «писать могут все» из брифа, выраженное в правах.

drop policy if exists places_insert_own on public.places;
create policy places_insert_own
    on public.places for insert
    to authenticated
    with check (auth.uid() = author_id);

drop policy if exists places_update_own on public.places;
create policy places_update_own
    on public.places for update
    to authenticated
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);

drop policy if exists places_delete_own on public.places;
create policy places_delete_own
    on public.places for delete
    to authenticated
    using (auth.uid() = author_id);

drop policy if exists route_templates_insert_own on public.route_templates;
create policy route_templates_insert_own
    on public.route_templates for insert
    to authenticated
    with check (auth.uid() = author_id);

drop policy if exists route_templates_update_own on public.route_templates;
create policy route_templates_update_own
    on public.route_templates for update
    to authenticated
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);

drop policy if exists route_templates_delete_own on public.route_templates;
create policy route_templates_delete_own
    on public.route_templates for delete
    to authenticated
    using (auth.uid() = author_id);

-- Дни и активности правит владелец маршрута, которому они принадлежат.

drop policy if exists route_template_days_write_own on public.route_template_days;
create policy route_template_days_write_own
    on public.route_template_days for all
    to authenticated
    using (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.route_templates rt
            where rt.id = route_template_id and rt.author_id = auth.uid()
        )
    );

drop policy if exists route_template_activities_write_own on public.route_template_activities;
create policy route_template_activities_write_own
    on public.route_template_activities for all
    to authenticated
    using (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.route_template_days d
            join public.route_templates rt on rt.id = d.route_template_id
            where d.id = route_template_day_id and rt.author_id = auth.uid()
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
-- Проверка 16.09.2026 сделана со стороны базы (список pg_policies и линтер
-- Supabase), а НЕ из браузера: сеть рабочей среды до *.supabase.co закрыта
-- политикой окружения. Пункты 1–3 остаются непроверенными вживую — прогони их
-- руками, когда откроешь сайт.
