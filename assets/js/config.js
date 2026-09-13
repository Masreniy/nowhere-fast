/**
 * Конфигурация Nowhere Fast.
 *
 * Ключ ниже — publishable (анонимный). Он предназначен для браузера и не
 * является секретом: любой посетитель видит его в исходниках страницы.
 * Из этого следует главное правило проекта: доступ к данным ограничивается
 * политиками RLS на стороне Supabase, а не тем, что скрыто в интерфейсе.
 * См. supabase/policies.sql и .claude/rules/security.md
 *
 * Ключ service_role не должен появиться в этом файле никогда.
 */
window.NF = window.NF || {};

NF.config = {
    SUPABASE_URL: 'https://btfmblmmhagkjzdwjkhg.supabase.co',
    SUPABASE_KEY: 'sb_publishable_26evHlZgEKupz2fsknDjnA_xO5hQqx0',

    /** Заглушка, когда у города нет своей картинки или она не загрузилась. */
    FALLBACK_IMAGE: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&h=400&fit=crop',
};
