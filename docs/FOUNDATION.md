# Nowhere Fast — Foundation

## Архитектура
Проект переходит от монолитных HTML-файлов к слоям: общая UI-система → data layer → доменные сущности → страницы.

## Домен
`cities` → `route_templates` → `route_template_days` → `route_template_activities`.

После стабилизации CMS:
`trips` → `trip_days` → `trip_items` и чек-листы.

Примечание от 16.09.2026: таблицы с похожими именами (`trips`, `trip_activities`,
`trip_packing`, `users`) в базе уже лежали — пустые и не связанные с кодом. Они
удалены, см. `supabase/cleanup-legacy.sql`. Этап 4 начинается с чистого листа.

## Этапы
1. Foundation: дизайн-система, единый data layer, SQL schema, indexes, constraints, RLS.
2. Public content: города, маршруты, дни, активности.
3. CMS: Supabase Auth, администраторы, CRUD и публикация.
4. Trip planner: поездки, даты, прогресс, чек-листы.
5. Maps.
6. Accounts.
7. Print/PDF.
8. AI.

## Главное изменение
Локальный пароль в JavaScript не является механизмом безопасности и не используется в новой архитектуре. Доступ к изменению данных должен определяться Supabase Auth + RLS.
