const APP_CONFIG = {
  supabaseUrl: 'https://btfmblmmhagkjzdwjkhg.supabase.co',
  supabaseKey: 'sb_publishable_26evHlZgEKupz2fsknDjnA_xO5hQqx0'
};

const supabaseClient = window.supabase.createClient(
  APP_CONFIG.supabaseUrl,
  APP_CONFIG.supabaseKey
);

export { supabaseClient };
