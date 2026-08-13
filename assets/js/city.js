import { supabaseClient } from './app.js';
const app = document.querySelector('#app');
const id = new URLSearchParams(location.search).get('id');
const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function load(){
  if(!id){app.innerHTML='<div class="error">Не указан город.</div>';return;}
  const {data,error}=await supabaseClient.from('cities').select('*').eq('id',id).single();
  if(error){app.innerHTML='<div class="error">'+esc(error.message)+'</div>';return;}
  app.innerHTML='<a class="muted" href="index.html#cities">← Все города</a><div class="eyebrow">'+esc(data.country||'Направление')+'</div><h1 class="page-title">'+esc(data.name)+'</h1><p class="muted">'+esc(data.description||'')+'</p><img class="city-hero-image" src="'+esc(data.image_url||'')+'" alt="'+esc(data.name)+'"><div class="meta-grid"><div class="meta"><span class="eyebrow">Валюта</span><strong>'+esc(data.currency||'—')+'</strong></div><div class="meta"><span class="eyebrow">Язык</span><strong>'+esc(data.language||'—')+'</strong></div><div class="meta"><span class="eyebrow">Часовой пояс</span><strong>'+esc(data.timezone||'—')+'</strong></div><div class="meta"><span class="eyebrow">Виза</span><strong>'+esc(data.visa_info||'—')+'</strong></div></div><h2>Маршруты</h2>';
}
load();
