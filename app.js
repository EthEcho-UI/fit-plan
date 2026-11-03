'use strict';
/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const todayStr = () => ymd(new Date());
const nf = (x, d = 0) => (x ?? 0).toLocaleString('cs-CZ', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const r0 = x => Math.round(x || 0);
const DOWS = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
const DOWL = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];
const dm = s => { const d = parse(s); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

/* ---------- plan definition ---------- */
const TASKS = {
  run_short: { l: 'Krátký běh', k: 250 },
  bike_mon: { l: 'Kolo – doplnit do 17 km za den', k: 200 },
  canoe: { l: 'Canoepolo trénink (~2 h)', k: 400 },
  gym: { l: 'Posilovna (ruce, záda, core)', k: 200 },
  bike17: { l: 'Kolo 17 km', k: 250 },
  run_int: { l: 'Intervalový běh', k: 450 },
  bike40: { l: 'Kolo 40 km', k: 600 },
  run_long: { l: 'Dlouhý běh', k: 650 },
  climb: { l: 'Lezení', k: 350 },
};
const WEEK = { 1: ['run_short', 'bike_mon'], 2: ['canoe', 'gym', 'bike17'], 3: ['run_int', 'bike40'], 4: ['canoe', 'gym', 'bike17'], 5: 'fri', 6: [], 0: [] };
const FRI = { both: ['run_long', 'climb'], run: ['run_long'], climb: ['climb'] };
const FRI_L = { both: 'Dlouhý běh + lezení', run: 'Jen dlouhý běh', climb: 'Jen lezení' };
const FUEL = {
  1: 'Lehký den: normální jídlo, bílkoviny v každém jídle. Sacharidy stačí střední.',
  2: 'Canoepolo + posilovna: 1–3 h před tréninkem jídlo s 40–80 g sacharidů a ~25 g bílkovin. U 2h tréninku 30–60 g sacharidů za hodinu (banán, izotonik, gel). Do 1–2 h po tréninku 25–40 g bílkovin + sacharidy.',
  3: 'Intervaly + 40 km kolo: nejtěžší den – sacharidy před i během (30–60 g/h u kola), po tréninku bílkoviny + sacharidy. Nešetři kalorie dopředu.',
  4: 'Canoepolo + posilovna: 1–3 h před tréninkem jídlo s 40–80 g sacharidů a ~25 g bílkovin. U 2h tréninku 30–60 g sacharidů za hodinu. Po tréninku 25–40 g bílkovin + sacharidy.',
  5: 'Dlouhý běh: večer předtím a ráno sacharidy; při běhu nad ~75 min 30–60 g sacharidů/h. Po běhu bílkoviny + sacharidy.',
  6: 'Odpočinek: drž bílkoviny, sacharidy nižší, spánek 7–8 h. Klidná chůze 30 min nebo mobilita je OK.',
  0: 'Odpočinek: drž bílkoviny, sacharidy nižší, spánek 7–8 h. Dobrý den na přípravu jídel na týden.',
};
const MEALS = { snidane: 'Snídaně', svacina: 'Svačina', obed: 'Oběd', trenink: 'Při/po tréninku', vecere: 'Večeře' };
const NUTR = [ // key, label, unit, reference, kind (min = goal to reach, max = limit)
  ['fiber', 'Vláknina', 'g', 30, 'min'], ['potassium_mg', 'Draslík', 'mg', 3500, 'min'], ['calcium_mg', 'Vápník', 'mg', 1000, 'min'],
  ['iron_mg', 'Železo', 'mg', 10, 'min'], ['magnesium_mg', 'Hořčík', 'mg', 400, 'min'], ['vitc_mg', 'Vitamin C', 'mg', 100, 'min'],
  ['vitd_ug', 'Vitamin D', 'µg', 15, 'min'], ['sodium_mg', 'Sodík', 'mg', 2300, 'max'], ['sugar', 'Cukry', 'g', 50, 'max'],
];
const NK = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'magnesium_mg', 'vitc_mg', 'vitd_ug'];

/* ---------- state ---------- */
const DEFAULTS = () => ({
  profile: {
    height: 175, age: 30, sex: 'm', startDate: todayStr(), startWeight: 80, goalWeight: 75, bodyFat: 25,
    proteinPerKg: 1.8, ramp: [0, 0, 150, 300, 450], neat: 1.2, credit: 75, taskKcal: {},
  },
  days: {}, favorites: [],
});
let S = null, rev = 0, saveTimer = null, dirty = false, syncing = false;
const ui = { tab: 'today', date: todayStr(), add: null, range: 'day' };

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { } return null; };
const token = () => ls('wl_token') || '';
// Where the API lives: when opened from the PC server itself (not github.io) default to same origin.
const isPages = () => /\.github\.io$/.test(location.hostname);
const serverBase = () => (ls('wl_server') || (isPages() ? '' : location.origin)).replace(/\/+$/, '');
const hasServer = () => !!serverBase();
async function api(path, opt = {}) {
  return fetch(serverBase() + path, { ...opt, headers: { 'Content-Type': 'application/json', 'X-Token': token(), ...(opt.headers || {}) } });
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }
let syncTxt = '';
function setSync(txt) { syncTxt = txt; const e = $('#sync'); if (e) e.textContent = txt; }
const norm = st => { const def = DEFAULTS(); st.profile = { ...def.profile, ...st.profile }; st.days ||= {}; st.favorites ||= []; st.meta ||= { pu: 0, fu: 0 }; return st; };

// Local-first: the phone copy (localStorage) is always written; the PC server is a sync target + AI backend.
function persistLocal() { ls('wl_state', JSON.stringify({ rev, dirty, state: S })); }
function merge(a, b) { // per-day newest wins; profile / favorites newest wins
  const out = { days: {}, meta: { pu: Math.max(a.meta.pu, b.meta.pu), fu: Math.max(a.meta.fu, b.meta.fu) } };
  for (const k of new Set([...Object.keys(a.days), ...Object.keys(b.days)])) {
    const x = a.days[k], y = b.days[k];
    out.days[k] = !y || (x && (x._u || 0) >= (y._u || 0)) ? x : y;
  }
  out.profile = a.meta.pu >= b.meta.pu ? a.profile : b.profile;
  out.favorites = a.meta.fu >= b.meta.fu ? a.favorites : b.favorites;
  return out;
}
async function load() {
  try { const l = JSON.parse(ls('wl_state') || 'null'); if (l?.state) { S = norm(l.state); rev = l.rev || 0; dirty = !!l.dirty; } } catch { }
  if (!S) { S = norm(DEFAULTS()); dirty = true; }
  persistLocal();
}
function save() { dirty = true; persistLocal(); setSync(hasServer() ? 'ukládám…' : 'uloženo v telefonu'); clearTimeout(saveTimer); saveTimer = setTimeout(sync, 600); }
async function sync(quiet) {
  if (!hasServer()) { setSync('uloženo v telefonu'); return; }
  if (syncing) { saveTimer = setTimeout(sync, 800); return; }
  syncing = true;
  try {
    for (let i = 0; i < 3; i++) {
      const r = await api('/api/state'); if (r.status === 401) { setSync('⚠ špatný token'); return; }
      const cur = await r.json();
      if (cur.state) { S = norm(merge(S, norm(cur.state))); }
      const w = await api('/api/state', { method: 'PUT', body: JSON.stringify({ rev: cur.rev, state: S }) });
      if (w.status === 409) continue;
      if (!w.ok) throw new Error(w.status);
      rev = (await w.json()).rev; dirty = false; persistLocal(); setSync('✓ synchronizováno'); if (!ui.add) rerender(); return;
    }
    throw new Error('conflict');
  } catch (e) { setSync('⚠ PC nedostupné – data jsou v telefonu'); if (!quiet) saveTimer = setTimeout(() => sync(true), 20000); }
  finally { syncing = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !ui.add) sync(true); });
addEventListener('online', () => sync(true));

/* ---------- data accessors ---------- */
const getDay = d => S.days[d] || {};
const mut = d => { const x = (S.days[d] ||= {}); x._u = Date.now(); return x; };
function weightOn(date) {
  let best = null;
  for (const k of Object.keys(S.days)) if (k <= date && S.days[k].weight && (!best || k > best)) best = k;
  return best ? S.days[best].weight : S.profile.startWeight;
}
function tasksFor(date) {
  const dow = parse(date).getDay(), w = WEEK[dow];
  return w === 'fri' ? FRI[getDay(date).fri || 'both'] : w;
}
const taskKcal = id => S.profile.taskKcal[id] ?? TASKS[id].k;
const dayComplete = date => { const t = tasksFor(date); return t.length > 0 && t.every(id => getDay(date).tasks?.[id]); };
const weekIdx = date => Math.max(0, Math.floor(diffDays(date, S.profile.startDate) / 7));
const deficitFor = date => { const r = S.profile.ramp; return r[Math.min(weekIdx(date), r.length - 1)] || 0; };
function bmr(w) { const p = S.profile; return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5); }
function targets(date) {
  const p = S.profile, w = weightOn(date), b = bmr(w);
  const ex = tasksFor(date).reduce((a, id) => a + taskKcal(id), 0);
  const tdee = b * p.neat + ex * p.credit / 100, def = deficitFor(date);
  const kcal = Math.round(Math.max(b, tdee - def) / 10) * 10;
  const protein = r0(p.proteinPerKg * w), fat = r0(0.8 * w);
  return { kcal, tdee: r0(tdee), def, protein, fat, carbs: Math.max(0, r0((kcal - protein * 4 - fat * 9) / 4)), ex, water: 2500 + (ex > 0 ? 500 : 0), bmr: r0(b) };
}
function totals(date) {
  const t = Object.fromEntries(NK.map(k => [k, 0]));
  for (const e of getDay(date).food || []) for (const k of NK) t[k] += +e[k] || 0;
  return t;
}
const loggedDays = () => Object.keys(S.days).filter(d => (S.days[d].food || []).length).sort();

/* ---------- views ---------- */
function rerender() { renderTop(); renderTabs(); renderView(); }
function renderTop() {
  const T = { today: 'Dnes', food: 'Jídlo', nutr: 'Živiny', plan: 'Plán', prog: 'Pokrok', set: 'Nastavení' }[ui.tab];
  const showDate = ['today', 'food', 'nutr'].includes(ui.tab);
  const d = ui.date, isT = d === todayStr();
  $('#top').innerHTML = `<h1>${T}</h1>` + (showDate ? `
    <button class="sm" data-a="shift" data-n="-1" aria-label="Předchozí den">‹</button>
    <button class="sm ${isT ? 'ghost' : ''}" data-a="gotoday">${isT ? 'Dnes' : ''} ${DOWS[parse(d).getDay()]} ${dm(d)}</button>
    <button class="sm" data-a="shift" data-n="1" aria-label="Další den">›</button>` : '') + `<span class="sync" id="sync">${esc(syncTxt)}</span>`;
}
function renderTabs() {
  const ICO = {'today': '<path d="M4 12l5 5L20 6"/>', 'food': '<path d="M7 3v8M4 3v5a3 3 0 006 0V3M7 11v10M17 3c-2 2-3 5-3 8h3v10"/>', 'nutr': '<path d="M12 21c-5 0-8-4-8-9 4 0 7 2 8 5 1-3 4-5 8-5 0 5-3 9-8 9zM12 17V7"/>', 'plan': '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', 'prog': '<path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/>', 'set': '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'};
  const t = [['today', 'Dnes'], ['food', 'Jídlo'], ['nutr', 'Živiny'], ['plan', 'Plán'], ['prog', 'Pokrok'], ['set', 'Další']];
  $('#tabs').innerHTML = `<div class="in">${t.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg>${l}</button>`).join('')}</div>`;
}
function renderView() {
  if (!S) return;
  const v = { today: vToday, food: vFood, nutr: vNutr, plan: vPlan, prog: vProg, set: vSet }[ui.tab]();
  $('#view').innerHTML = v;
}
function bar(val, max, cls = '') { const p = max ? Math.min(100, val / max * 100) : 0; return `<div class="bar ${cls}"><i style="width:${p}%"></i></div>`; }
function macroRow(label, val, tgt, color, unit = 'g') {
  return `<div class="macro"><div class="t"><span>${label}</span><span><b>${nf(val)}</b> / ${nf(tgt)} ${unit}</span></div><div class="bar"><i style="width:${tgt ? Math.min(100, val / tgt * 100) : 0}%;background:${color}"></i></div></div>`;
}

function vToday() {
  const d = ui.date, day = getDay(d), tg = targets(d), tot = totals(d), tasks = tasksFor(d), dow = parse(d).getDay();
  const left = tg.kcal - tot.kcal, over = left < 0, pct = Math.min(100, tot.kcal / tg.kcal * 100);
  const done = tasks.filter(id => day.tasks?.[id]).length;
  const phase = tg.def === 0 ? 'bez deficitu' : `deficit −${tg.def} kcal`;
  const water = day.water || 0;
  const tips = [];
  if (tot.kcal && tg.protein - tot.protein > 0) tips.push(`Zbývá ${nf(tg.protein - tot.protein)} g bílkovin.`);
  const prevSleep = day.sleep;
  if (prevSleep && prevSleep < 7) tips.push({ w: 1, t: `Spánek jen ${nf(prevSleep, 1)} h – cíl je 7–8 h. Při nedospání roste hlad a klesá regenerace.` });
  return (S.meta.pu ? '' : `<div class="card"><h2>Nastav si profil</h2><p class="small mute" style="margin-top:0">Výchozí hodnoty jsou jen ukázka. Připoj server (Nastavení → Server) a profil se stáhne z PC, nebo ho zadej ručně.</p><button class="primary" data-a="tab" data-k="set">Otevřít nastavení</button></div>`) + `
  <div class="card">
    <div class="row" style="gap:16px;flex-wrap:nowrap">
      <div class="ring ${over ? 'over' : ''}" style="--v:${pct}"><div><div><span class="big" style="font-size:26px">${nf(Math.abs(left))}</span><br><span class="small mute">${over ? 'kcal přes' : 'kcal zbývá'}</span></div></div></div>
      <div class="grow stack">
        <div class="small mute">Týden ${weekIdx(d) + 1} · ${phase}</div>
        <div><b>${nf(tot.kcal)}</b> / ${nf(tg.kcal)} kcal</div>
        <div class="small mute">Spotřeba dne ≈ ${nf(tg.tdee)} kcal (BMR ${nf(tg.bmr)})</div>
        <button class="primary" data-a="add">+ Přidat jídlo</button>
      </div>
    </div>
    <div class="stack" style="margin-top:14px">
      ${macroRow('Bílkoviny', tot.protein, tg.protein, 'var(--p)')}
      ${macroRow('Sacharidy', tot.carbs, tg.carbs, 'var(--c)')}
      ${macroRow('Tuky', tot.fat, tg.fat, 'var(--f)')}
    </div>
    ${tips.map(t => `<div class="tip ${t.w ? 'warn' : ''}" style="margin-top:10px">${esc(t.t || t)}</div>`).join('')}
  </div>
  <div class="card">
    <h2>${DOWL[dow]} – trénink <small>${tasks.length ? `${done}/${tasks.length}` : ''}</small></h2>
    ${dow === 5 ? `<div class="seg" style="margin-bottom:10px">${Object.entries(FRI_L).map(([k, l]) => `<button class="${(day.fri || 'both') === k ? 'on' : ''}" data-a="fri" data-k="${k}">${l}</button>`).join('')}</div>` : ''}
    ${tasks.length ? `<div class="stack">${tasks.map(id => `<button class="task ${day.tasks?.[id] ? 'done' : ''}" data-a="task" data-k="${id}"><span class="box">✓</span><span class="lbl grow">${TASKS[id].l}</span><span class="small mute">~${taskKcal(id)} kcal</span></button>`).join('')}</div>
      ${done === tasks.length ? '<div class="tip ok" style="margin-top:10px">Splněno ✓</div>' : ''}`
      : '<div class="mute">Odpočinek – regenerace je součást plánu.</div>'}
    <div class="tip" style="margin-top:10px">${FUEL[dow]}</div>
  </div>
  <div class="card">
    <h2>Rychlý záznam</h2>
    <div class="grid2">
      <label class="f">Váha ráno (kg)<input type="number" inputmode="decimal" step="0.1" data-c="weight" value="${day.weight ?? ''}" placeholder="${nf(weightOn(d), 1)}"></label>
      <label class="f">Pas (cm)<input type="number" inputmode="decimal" step="0.5" data-c="waist" value="${day.waist ?? ''}"></label>
      <label class="f">Spánek (h)<input type="number" inputmode="decimal" step="0.25" data-c="sleep" value="${day.sleep ?? ''}"></label>
      <label class="f">Tuk % (volitelné)<input type="number" inputmode="decimal" step="0.1" data-c="bf" value="${day.bf ?? ''}"></label>
    </div>
    <div style="margin-top:12px"><div class="t row" style="justify-content:space-between"><span class="small mute">Voda</span><span class="small"><b>${nf(water / 1000, 2)}</b> / ${nf(tg.water / 1000, 1)} l</span></div>
      ${bar(water, tg.water)}
      <div class="row" style="margin-top:8px"><button class="sm" data-a="water" data-n="250">+250 ml</button><button class="sm" data-a="water" data-n="500">+500 ml</button><button class="sm ghost" data-a="water" data-n="-250">−250</button></div></div>
    <div style="margin-top:12px"><div class="small mute" style="margin-bottom:6px">Energie / pocit síly (1 = vyčerpaný, 5 = plný sil)</div>
      <div class="seg">${[1, 2, 3, 4, 5].map(n => `<button class="${day.energy === n ? 'on' : ''}" data-a="energy" data-n="${n}">${n}</button>`).join('')}</div></div>
    <label class="f" style="margin-top:12px">Poznámka<input type="text" data-c="note" value="${esc(day.note || '')}" placeholder="trénink, pocity, spánek…"></label>
  </div>`;
}

function entryHtml(e, edit = true) {
  return `<div class="entry"><div><span class="nm">${esc(e.name)}</span><br><span class="small mute">${e.t || ''} · ${MEALS[e.meal] || ''} · B ${nf(e.protein)} S ${nf(e.carbs)} T ${nf(e.fat)}${e.confidence ? ' · jistota: ' + ({ low: 'nízká', medium: 'střední', high: 'vysoká' }[e.confidence]) : ''}</span></div>
    <div style="text-align:right"><b>${nf(e.kcal)}</b> <span class="small mute">kcal</span><br>${edit ? `<button class="sm ghost" data-a="editentry" data-id="${e.id}">upravit</button><button class="sm ghost danger" data-a="delentry" data-id="${e.id}">✕</button>` : ''}</div></div>`;
}
function recents() {
  const seen = new Set(), out = [];
  for (const d of Object.keys(S.days).sort().reverse().slice(0, 60)) for (const e of [...(S.days[d].food || [])].reverse()) {
    const k = e.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); }
    if (out.length >= 8) return out;
  }
  return out;
}
function vFood() {
  const d = ui.date, food = [...(getDay(d).food || [])].sort((a, b) => (a.t || '').localeCompare(b.t || '')), tot = totals(d), tg = targets(d);
  const rec = recents();
  return `<div class="card"><div class="row"><div class="grow"><b>${nf(tot.kcal)}</b> / ${nf(tg.kcal)} kcal<br><span class="small mute">B ${nf(tot.protein)}/${tg.protein} · S ${nf(tot.carbs)}/${tg.carbs} · T ${nf(tot.fat)}/${tg.fat} g</span></div><button class="primary" data-a="add">+ Přidat</button></div></div>
  <div class="card"><h2>Záznamy</h2>${food.length ? food.map(e => entryHtml(e)).join('') : '<div class="mute">Zatím nic. Popiš jídlo, nahraj fotku, nebo přidej ručně.</div>'}</div>
  ${S.favorites.length ? `<div class="card"><h2>Oblíbené</h2><div class="row">${S.favorites.map((f, i) => `<span class="row" style="gap:0"><button class="sm" data-a="quickfav" data-i="${i}">${esc(f.name)} · ${nf(f.kcal)}</button><button class="sm ghost danger" data-a="delfav" data-i="${i}" aria-label="Odebrat">✕</button></span>`).join('')}</div></div>` : ''}
  ${rec.length ? `<div class="card"><h2>Nedávné <small>klepnutím přidat znovu</small></h2><div class="row">${rec.map((e, i) => `<button class="sm" data-a="quickrec" data-i="${i}">${esc(e.name)} · ${nf(e.kcal)}</button>`).join('')}</div></div>` : ''}`;
}

function rangeTotals() {
  if (ui.range === 'day') return { t: totals(ui.date), n: 1, label: 'dne' };
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(ui.date, -i); if ((getDay(d).food || []).length) days.push(d); }
  const t = Object.fromEntries(NK.map(k => [k, 0]));
  for (const d of days) { const x = totals(d); for (const k of NK) t[k] += x[k]; }
  for (const k of NK) t[k] = days.length ? t[k] / days.length : 0;
  return { t, n: days.length, label: 'průměr 7 dní (dny se záznamem)' };
}
function vNutr() {
  const { t, n, label } = rangeTotals(), tg = targets(ui.date);
  const missing = ui.range === 'day' && (getDay(ui.date).food || []).some(e => e.sodium_mg == null && e.fiber == null);
  return `<div class="seg"><button class="${ui.range === 'day' ? 'on' : ''}" data-a="range" data-k="day">Den</button><button class="${ui.range === 'week' ? 'on' : ''}" data-a="range" data-k="week">7 dní</button></div>
  <div class="card"><h2>Makroživiny <small>${label}</small></h2>
    <div class="kpis">
      <div class="kpi"><b>${nf(t.kcal)}</b><span>kcal / ${nf(tg.kcal)}</span></div>
      <div class="kpi"><b style="color:var(--p)">${nf(t.protein)} g</b><span>bílkoviny / ${tg.protein} (${t.protein && S.profile ? nf(t.protein / weightOn(ui.date), 1) : 0} g/kg)</span></div>
      <div class="kpi"><b style="color:var(--c)">${nf(t.carbs)} g</b><span>sacharidy / ${tg.carbs}</span></div>
      <div class="kpi"><b style="color:var(--f)">${nf(t.fat)} g</b><span>tuky / ${tg.fat}</span></div>
    </div>
    ${t.kcal ? `<div class="small mute" style="margin-top:10px">Podíl kcal: bílkoviny ${r0(t.protein * 400 / t.kcal)} % · sacharidy ${r0(t.carbs * 400 / t.kcal)} % · tuky ${r0(t.fat * 900 / t.kcal)} %</div>` : ''}
  </div>
  <div class="card"><h2>Mikroživiny a vláknina <small>orientační doporučení pro dospělého muže</small></h2>
    <div class="stack">${NUTR.map(([k, l, u, ref, kind]) => {
      const v = t[k] || 0, ratio = v / ref, bad = kind === 'max' && ratio > 1, cls = bad ? 'over' : '';
      return `<div class="macro"><div class="t"><span>${l}${kind === 'max' ? ' <span class="chip">limit</span>' : ''}</span><span class="${bad ? 'warn' : ''}"><b>${nf(v, v < 10 ? 1 : 0)}</b> / ${nf(ref)} ${u}</span></div>${bar(v, ref, cls)}</div>`;
    }).join('')}</div>
    <p class="small mute" style="margin-bottom:0">Hodnoty jsou odhady z AI (u balených potravin podle etiket, pokud je našla na webu). Ručně zadané položky mikroživiny nemají. Sodík zahrnuje i sůl z vaření jen tehdy, když ji zmíníš. Při větším pocení (canoepolo) je vyšší příjem sodíku a draslíku normální.</p>
  </div>`;
}

function vPlan() {
  const today = todayStr(), wk = weekIdx(today), mon = addDays(today, 1 - (parse(today).getDay() || 7));
  const ramp = S.profile.ramp, phases = [];
  for (let i = 0; i < Math.max(8, ramp.length + 2); i++) phases.push(`<span class="chip ${i === wk ? 'go' : ''}">T${i + 1}: ${(ramp[Math.min(i, ramp.length - 1)] || 0) ? '−' + ramp[Math.min(i, ramp.length - 1)] : '0'}</span>`);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return `<div class="card"><h2>Fáze <small>deficit kcal/den podle týdne od ${dm(S.profile.startDate)}</small></h2>
    <div class="row">${phases.join('')}</div>
    <p class="small mute" style="margin-bottom:0">Prvních 2–3 týdny žádný / malý deficit (návrat do rytmu, kondice, síla), pak postupně 300 → 450 kcal. Upravíš v Nastavení.</p></div>
  ${order.map(dow => {
    const date = addDays(mon, (dow || 7) - 1), tasks = tasksFor(date), tg = targets(date), isT = date === today;
    const fridayNote = dow === 5 ? `<div class="small mute">${FRI_L[getDay(date).fri || 'both']} (volba v den na záložce Dnes)</div>` : '';
    return `<div class="card" ${isT ? 'style="border-color:var(--accent)"' : ''}>
      <h2><span>${DOWL[dow]} <small>${dm(date)}</small></span><span class="chip ${dayComplete(date) ? 'go' : ''}">${tasks.length ? (dayComplete(date) ? 'splněno' : tasks.filter(id => getDay(date).tasks?.[id]).length + '/' + tasks.length) : 'odpočinek'}</span></h2>
      ${tasks.length ? `<ul style="margin:0 0 8px;padding-left:18px">${tasks.map(id => `<li>${TASKS[id].l}</li>`).join('')}</ul>` : ''}${fridayNote}
      <div class="small">Cíl: <b>${nf(tg.kcal)} kcal</b> · B ${tg.protein} g · S ${tg.carbs} g · T ${tg.fat} g</div>
      <div class="small mute">${FUEL[dow]}</div>
      <button class="sm ghost" data-a="gotodate" data-d="${date}">otevřít den →</button></div>`;
  }).join('')}
  <div class="card"><h2>Pravidla</h2><ul style="margin:0;padding-left:18px" class="stack">
    <li><b>Bílkoviny ${S.profile.proteinPerKg} g/kg</b> (cíl 1,6–2,0) rozložit do 3–5 jídel po 25–40 g.</li>
    <li><b>Sacharidy kolem tréninků</b> – před a během dlouhých/intenzivních; v odpočinkové dny méně.</li>
    <li><b>Tuky</b> ≥ 0,8 g/kg (hormony, vstřebávání vitamínů).</li>
    <li><b>Spánek 7–8 h</b>, voda 2,5–3 l (víc při tréninku).</li>
    <li>Vážit ráno po toalatě, hodnotit <b>trend</b> (týdenní průměr), ne jednotlivé dny. Zásoby glykogenu a vody mění váhu o 1–2 kg.</li>
    <li>Cíl úbytku 0,5–0,9 kg/týden; když se sílou/výkonem děje něco špatného nebo je energie dlouho 1–2, přidej kalorie.</li></ul></div>`;
}

/* ---------- charts ---------- */
function lineChart({ x0, x1, y0, y1, series = [], band, xt = [], w = 640, h = 230 }) {
  const L = 38, R = 10, T = 10, B = 22, sx = x => L + (x - x0) / (x1 - x0 || 1) * (w - L - R), sy = y => h - B - (y - y0) / (y1 - y0 || 1) * (h - T - B);
  const step = (y1 - y0) > 12 ? 2 : (y1 - y0) > 5 ? 1 : 0.5, yt = []; for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) yt.push(v);
  let s = yt.map(v => `<line x1="${L}" x2="${w - R}" y1="${sy(v)}" y2="${sy(v)}" style="stroke:var(--line)"/><text x="${L - 5}" y="${sy(v) + 3}" text-anchor="end">${nf(v, 1)}</text>`).join('');
  s += xt.map(([x, l]) => `<text x="${sx(x)}" y="${h - 6}" text-anchor="middle">${l}</text>`).join('');
  if (band) s += `<polygon points="${band.hi.map(p => sx(p[0]) + ',' + sy(p[1])).join(' ')} ${[...band.lo].reverse().map(p => sx(p[0]) + ',' + sy(p[1])).join(' ')}" style="fill:var(--accent);opacity:.15"/>`;
  for (const se of series) {
    if (!se.pts.length) continue;
    if (se.line !== false && se.pts.length > 1) s += `<polyline fill="none" points="${se.pts.map(p => sx(p[0]) + ',' + sy(p[1])).join(' ')}" style="stroke:${se.color};stroke-width:${se.sw || 2.5}" ${se.dash ? 'stroke-dasharray="4 4"' : ''} stroke-linejoin="round"/>`;
    if (se.dots) s += se.pts.map(p => `<circle cx="${sx(p[0])}" cy="${sy(p[1])}" r="3" style="fill:${se.color};opacity:${se.op ?? 1}"/>`).join('');
  }
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${s}</svg>`;
}
function slope(pts) { // kg per day via least squares
  const n = pts.length; if (n < 3) return null;
  const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0); if (sxx === 0) return null;
  return pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
}
function weightSeries() {
  const s = S.profile.startDate, ds = Object.keys(S.days).filter(d => S.days[d].weight).sort();
  const raw = ds.map(d => [diffDays(d, s), S.days[d].weight, d]);
  let ema = null; const trend = raw.map(p => { ema = ema == null ? p[1] : ema + 0.2 * (p[1] - ema); return [p[0], ema]; });
  return { raw, trend };
}
function vProg() {
  const p = S.profile, today = todayStr(), { raw, trend } = weightSeries();
  const cur = trend.length ? trend[trend.length - 1][1] : p.startWeight, last = raw.length ? raw[raw.length - 1][1] : p.startWeight;
  const todayX = diffDays(today, p.startDate), recent = raw.filter(q => q[0] >= todayX - 14);
  const sl = slope(recent), rate = sl == null || (recent[recent.length - 1][0] - recent[0][0]) < 6 ? null : -sl * 7;
  const defStart = Math.max(0, (p.ramp.findIndex(x => x > 0)) * 7);
  let chart = '<div class="mute">Zapiš první váhu na záložce Dnes.</div>';
  if (raw.length) {
    const x1 = Math.max(todayX, raw[raw.length - 1][0]) + 21, ys = raw.map(q => q[1]).concat([p.startWeight, p.goalWeight]);
    const bx = Math.min(Math.max(defStart, 0), Math.max(todayX, 0)), by = (trend.find(q => q[0] >= bx) || trend[0] || [0, p.startWeight])[1];
    const band = { lo: [[bx, by], [x1, by - 0.5 * (x1 - bx) / 7]], hi: [[bx, by], [x1, by - 0.9 * (x1 - bx) / 7]] };
    const y0 = Math.floor(Math.min(...ys, band.hi[1][1]) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
    const xt = []; for (let x = 0; x <= x1; x += 14) xt.push([x, dm(addDays(p.startDate, x))]);
    chart = lineChart({
      x0: Math.min(0, raw[0][0]), x1, y0: Math.max(y0, 40), y1, xt, band,
      series: [{ pts: raw.map(q => [q[0], q[1]]), color: 'var(--mute)', dots: true, line: false, op: .6 }, { pts: trend, color: 'var(--accent)' },
      { pts: [[0, p.goalWeight], [x1, p.goalWeight]], color: 'var(--ok)', dash: true, sw: 1.5 }],
    });
  }
  // adherence
  let planned = 0, did = 0, streak = 0, streakOpen = true;
  for (let i = diffDays(today, p.startDate); i >= 0; i--) {
    const d = addDays(p.startDate, i), t = tasksFor(d); if (!t.length) continue;
    const ok = dayComplete(d); if (d === today && !ok) continue;
    planned++; if (ok) did++;
    if (streakOpen) { if (ok) streak++; else streakOpen = false; }
  }
  // 7-day nutrition
  const ld = loggedDays().filter(d => d > addDays(today, -7) && d <= today);
  const aK = avg(ld.map(d => totals(d).kcal)), aP = avg(ld.map(d => totals(d).protein)), aT = avg(ld.map(d => targets(d).kcal));
  const sleeps = Object.keys(S.days).filter(d => d > addDays(today, -7) && S.days[d].sleep).map(d => S.days[d].sleep);
  const energies = Object.keys(S.days).filter(d => d > addDays(today, -7) && S.days[d].energy).map(d => S.days[d].energy);
  // advice
  const advice = [];
  const inDeficit = deficitFor(today) > 0;
  if (rate == null) advice.push('Pro odhad tempa potřebuju aspoň 3 váhy za posledních 14 dní (rozpětí 6+ dní).');
  else if (!inDeficit) advice.push(`Úvodní fáze bez deficitu – tempo ${nf(rate, 2)} kg/týd. je jen informativní.`);
  else if (rate < 0.3) advice.push({ w: 1, t: `Úbytek ${nf(rate, 2)} kg/týd. je pod cílem 0,5–0,9. Nejdřív zkontroluj, že zapisuješ vše (oleje, nápoje, víkend); potom zvaž −150 kcal nebo víc pohybu.` });
  else if (rate > 1.0) advice.push({ w: 1, t: `Úbytek ${nf(rate, 2)} kg/týd. je rychlý – hrozí ztráta svalů a energie při tréninku. Přidej ~150–250 kcal (hlavně sacharidy kolem tréninku).` });
  else advice.push(`Tempo ${nf(rate, 2)} kg/týd. je v pořádku.`);
  if (energies.length >= 3 && avg(energies) < 2.5) advice.push({ w: 1, t: 'Energie za týden vychází nízko – zvaž dočasně menší deficit nebo víc sacharidů před tréninkem.' });
  if (sleeps.length >= 3 && avg(sleeps) < 7) advice.push({ w: 1, t: `Průměrný spánek ${nf(avg(sleeps), 1)} h < 7 h.` });
  const eta = rate && rate > 0.1 && cur > p.goalWeight ? Math.ceil((cur - p.goalWeight) / rate) : null;
  // weekly table
  const rows = [];
  for (let i = Math.max(0, weekIdx(today) - 7); i <= weekIdx(today); i++) {
    const ds = Array.from({ length: 7 }, (_, j) => addDays(p.startDate, i * 7 + j)), ws = ds.map(d => S.days[d]?.weight).filter(Boolean);
    const fd = ds.filter(d => (getDay(d).food || []).length), td = ds.filter(d => d <= today && tasksFor(d).length);
    rows.push({ i, from: ds[0], w: avg(ws), k: avg(fd.map(d => totals(d).kcal)), pr: avg(fd.map(d => totals(d).protein)), did: td.filter(dayComplete).length, pl: td.length });
  }
  const waists = Object.keys(S.days).filter(d => S.days[d].waist).sort().map(d => [diffDays(d, p.startDate), S.days[d].waist]);
  return `<div class="card"><h2>Váha <small>šedě denní, zeleně trend, pás = cíl 0,5–0,9 kg/týd.</small></h2>${chart}
    <div class="kpis" style="margin-top:10px">
      <div class="kpi"><b>${nf(cur, 1)} kg</b><span>trend (start ${nf(p.startWeight, 1)})</span></div>
      <div class="kpi"><b class="${cur < p.startWeight ? 'ok' : ''}">${nf(cur - p.startWeight, 1)} kg</b><span>od začátku</span></div>
      <div class="kpi"><b>${rate == null ? '–' : nf(rate, 2)}</b><span>kg/týden (14 dní)</span></div>
      <div class="kpi"><b>${nf(cur - p.goalWeight, 1)} kg</b><span>do cíle ${nf(p.goalWeight)} kg${eta ? ` · ~${eta} týd.` : ''}</span></div>
    </div>
    ${advice.map(a => `<div class="tip ${a.w ? 'warn' : ''}" style="margin-top:10px">${esc(a.t || a)}</div>`).join('')}
  </div>
  <div class="card"><h2>Dodržování</h2><div class="kpis">
    <div class="kpi"><b>${planned ? r0(did / planned * 100) : 0} %</b><span>tréninků splněno (${did}/${planned})</span></div>
    <div class="kpi"><b>${streak}</b><span>tréninků v řadě</span></div>
    <div class="kpi"><b>${aK == null ? '–' : nf(aK)}</b><span>kcal/den (7 d)${aT ? ' · cíl ' + nf(aT) : ''}</span></div>
    <div class="kpi"><b>${aP == null ? '–' : nf(aP)} g</b><span>bílkoviny (7 d)</span></div>
    <div class="kpi"><b>${sleeps.length ? nf(avg(sleeps), 1) : '–'} h</b><span>spánek (7 d)</span></div>
    <div class="kpi"><b>${energies.length ? nf(avg(energies), 1) : '–'}/5</b><span>energie (7 d)</span></div></div></div>
  <div class="card"><h2>Týdny</h2><table><tr><th>Týden</th><th>Váha ø</th><th>kcal ø</th><th>B ø</th><th>Trénink</th></tr>
    ${rows.reverse().map(r => `<tr class="${r.i === weekIdx(today) ? 'today' : ''}"><td>T${r.i + 1} <span class="mute small">${dm(r.from)}</span></td><td>${r.w ? nf(r.w, 1) : '–'}</td><td>${r.k ? nf(r.k) : '–'}</td><td>${r.pr ? nf(r.pr) : '–'}</td><td>${r.pl ? r.did + '/' + r.pl : '–'}</td></tr>`).join('')}</table></div>
  ${waists.length > 0 ? `<div class="card"><h2>Obvod pasu <small>${nf(waists[0][1], 1)} → ${nf(waists[waists.length - 1][1], 1)} cm</small></h2>${lineChart({
    x0: Math.min(...waists.map(q => q[0])), x1: Math.max(1, ...waists.map(q => q[0])) + 1, y0: Math.floor(Math.min(...waists.map(q => q[1])) - 1), y1: Math.ceil(Math.max(...waists.map(q => q[1])) + 1),
    series: [{ pts: waists, color: 'var(--c)', dots: true }], xt: [], h: 160
  })}</div>` : ''}`;
}

function vSet() {
  const p = S.profile;
  const f = (label, key, step = 'any', type = 'number') => `<label class="f">${label}<input type="${type}" ${type === 'number' ? `inputmode="decimal" step="${step}"` : ''} data-c="p_${key}" value="${esc(p[key])}"></label>`;
  return `<div class="card"><h2>Profil</h2><div class="grid2">
    ${f('Výška (cm)', 'height')}${f('Věk (roky) – odhad!', 'age')}${f('Startovní váha (kg)', 'startWeight', 0.1)}${f('Cílová váha (kg)', 'goalWeight', 0.1)}
    ${f('Začátek plánu', 'startDate', 1, 'date')}${f('Odhad tuku % (start)', 'bodyFat', 0.5)}
    <label class="f">Pohlaví<select data-c="p_sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Muž</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Žena</option></select></label>
    ${f('Bílkoviny g/kg', 'proteinPerKg', 0.1)}
  </div></div>
  <div class="card"><h2>Kalorie</h2><div class="grid2">
    <label class="f">Deficit po týdnech (kcal, čárkou)<input type="text" data-c="p_ramp" value="${p.ramp.join(', ')}"></label>
    ${f('Koef. běžné aktivity mimo trénink', 'neat', 0.05)}
    ${f('Kolik % odhadu spálených kcal z tréninku počítat', 'credit', 5)}</div>
    <p class="small mute">Denní cíl = BMR (Mifflin–St Jeor) × koef. + % z tréninku − deficit. Odhady tréninků jsou hrubé; po 2–3 týdnech podle trendu váhy (záložka Pokrok) doladit.</p>
    <details><summary>Spálené kcal na jednotlivé tréninky</summary><div class="grid2" style="margin-top:8px">
      ${Object.entries(TASKS).map(([id, t]) => `<label class="f">${t.l}<input type="number" inputmode="numeric" data-c="tk_${id}" value="${taskKcal(id)}"></label>`).join('')}</div></details></div>
  <div class="card"><h2>Server (PC)</h2>
    <label class="f">Adresa serveru<input type="url" data-c="srv_url" value="${esc(ls('wl_server') || '')}" placeholder="https://optiplex-claude.xxxx.ts.net"></label>
    <label class="f" style="margin-top:8px">Token<input type="password" data-c="srv_token" value="${esc(token())}" placeholder="obsah data/token na PC" autocomplete="off"></label>
    <div class="row" style="margin-top:8px"><button data-a="srvtest">Otestovat a synchronizovat</button></div>
    <div id="health" class="small mute" style="margin-top:6px">${hasServer() ? 'Kontroluju server…' : 'Bez serveru: vše funguje, data jsou jen v telefonu, odhad jídla z fotky/textu nebude.'}</div>
    <p class="small mute" style="margin-bottom:0">Server dělá AI odhad jídla (Claude) a zálohuje data z telefonu.</p></div>
  <div class="card"><h2>Data</h2><div class="row"><button data-a="export">Export zálohy (JSON)</button><label class="btn">Import<input type="file" accept="application/json" data-c="import" hidden></label></div>
    <p class="small mute" style="margin-bottom:0">Data jsou v telefonu a (je-li server nastaven) i na PC v <code>data/state.json</code>.</p></div>`;
}

/* ---------- add / estimate modal ---------- */
function defaultMeal() { const h = new Date().getHours(); return h < 10 ? 'snidane' : h < 14 ? 'obed' : h < 17 ? 'svacina' : 'vecere'; }
const blankItem = () => ({ name: '', amount: '', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: null, sugar: null, sodium_mg: null, potassium_mg: null, calcium_mg: null, iron_mg: null, magnesium_mg: null, vitc_mg: null, vitd_ug: null });
function openAdd(entry) {
  if (entry) {
    ui.add = { editId: entry.id, meal: entry.meal, text: '', img: null, busy: false, err: '', t: entry.t,
      res: { meal_name: entry.name, items: JSON.parse(JSON.stringify(entry.items || [{ ...blankItem(), ...entry, name: entry.name }])), confidence: entry.confidence, notes: entry.notes || '', sources: entry.sources || [] } };
  } else ui.add = { meal: defaultMeal(), text: '', img: null, busy: false, err: '', res: null };
  renderModal();
}
function sumItems(items) {
  const t = {}; for (const k of NK) { const vals = items.map(i => i[k]).filter(v => v != null && v !== ''); t[k] = vals.length ? vals.reduce((a, b) => a + (+b || 0), 0) : (k === 'kcal' || k === 'protein' || k === 'carbs' || k === 'fat' ? 0 : null); }
  return t;
}
function renderModal() {
  const a = ui.add, m = $('#modal');
  if (!a) { m.innerHTML = ''; return; }
  const meals = `<div class="seg">${Object.entries(MEALS).map(([k, l]) => `<button class="${a.meal === k ? 'on' : ''}" data-a="meal" data-k="${k}">${l}</button>`).join('')}</div>`;
  let body;
  if (!a.res) {
    body = `${meals}
      <textarea id="addtext" rows="3" placeholder="Např.: 2 vejce, 2 krajíce žitného chleba s máslem, 200 g jogurtu. Nebo název produktu / jídla z restaurace." style="margin:10px 0">${esc(a.text)}</textarea>
      <div class="row" style="margin-bottom:10px"><label class="btn">Přiložit fotku<input type="file" accept="image/*" data-c="photo" hidden></label>${a.img ? `<img class="thumb" src="${a.img}" alt="Náhled"><button class="sm ghost danger" data-a="rmphoto">✕</button>` : ''}</div>
      ${a.err ? `<div class="tip warn" style="margin-bottom:10px">${esc(a.err)}</div>` : ''}
      <div class="row"><button class="primary grow" data-a="estimate" ${a.busy ? 'disabled' : ''}>${a.busy ? '<span class="spin"></span> Odhaduju (10–60 s)…' : 'Odhadnout živiny (Claude)'}</button><button data-a="manual" ${a.busy ? 'disabled' : ''}>Ručně</button></div>
      <p class="small mute">Můžeš uvést gramáž – přesnější než odhad z fotky. U balených produktů Claude zkusí najít etiketu na webu.</p>`;
  } else {
    const r = a.res, tot = sumItems(r.items);
    body = `${meals}
      <label class="f" style="margin-top:10px">Název záznamu<input type="text" data-c="rname" value="${esc(r.meal_name)}"></label>
      ${r.confidence ? `<div class="small mute" style="margin-top:6px">Jistota odhadu: <b>${{ low: 'nízká', medium: 'střední', high: 'vysoká' }[r.confidence]}</b></div>` : ''}
      ${r.notes ? `<div class="tip" style="margin:8px 0">${esc(r.notes)}</div>` : ''}
      <div class="row" style="margin:8px 0"><span class="small mute">Porce:</span>${[0.5, 0.75, 1.25, 1.5, 2].map(x => `<button class="sm" data-a="scale" data-x="${x}">×${x}</button>`).join('')}</div>
      <div class="stack">${r.items.map((it, i) => `<div class="item">
        <div class="row"><input type="text" data-c="it_name_${i}" value="${esc(it.name)}" placeholder="Potravina" class="grow" style="width:auto"><button class="sm ghost danger" data-a="delitem" data-i="${i}">✕</button></div>
        <input type="text" data-c="it_amount_${i}" value="${esc(it.amount || '')}" placeholder="Množství">
        <div class="nums">${[['kcal', 'kcal'], ['protein', 'B g'], ['carbs', 'S g'], ['fat', 'T g']].map(([k, l]) => `<label class="f">${l}<input type="number" inputmode="decimal" step="any" data-c="it_${k}_${i}" value="${nf(it[k] ?? 0, 1).replace(/\s/g, '').replace(',', '.')}"></label>`).join('')}</div></div>`).join('')}</div>
      <div class="row" style="margin:10px 0"><button class="sm" data-a="additem">+ položka</button><span class="grow"></span><span id="sumline"><b>${nf(tot.kcal)}</b> kcal · B ${nf(tot.protein)} · S ${nf(tot.carbs)} · T ${nf(tot.fat)}</span></div>
      ${(r.sources || []).length ? `<details><summary>Zdroje</summary>${r.sources.map(s => `<div class="small"><a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a></div>`).join('')}</details>` : ''}
      <div class="row" style="margin-top:12px"><button class="primary grow" data-a="saveentry">${a.editId ? 'Uložit změny' : 'Přidat do deníku'}</button><button data-a="savefav" title="Uložit mezi oblíbené">★</button></div>
      ${a.editId ? '' : '<button class="ghost" data-a="back" style="margin-top:8px">‹ zpět k popisu</button>'}`;
  }
  m.innerHTML = `<div class="sheet"><h3>${a.editId ? 'Upravit jídlo' : 'Přidat jídlo'}<button class="sm ghost" data-a="closeadd" aria-label="Zavřít">✕</button></h3>${body}</div>`;
}
function downscale(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Obrázek nejde načíst')); };
    img.src = url;
  });
}
async function runEstimate() {
  const a = ui.add; a.busy = true; a.err = ''; renderModal();
  try {
    const r = await api('/api/estimate', { method: 'POST', body: JSON.stringify({ text: a.text, image: a.img, meal: MEALS[a.meal] }) });
    const d = await r.json();
    if (r.status === 401) throw new Error('Špatný token – zkontroluj Nastavení → Server.');
    if (!r.ok) throw new Error(d.error || r.status);
    if (!ui.add) return;
    if (!d.items?.length) { a.err = d.notes || 'Nic jsem nerozpoznal – doplň popis.'; }
    else a.res = d;
  } catch (e) { if (ui.add) a.err = (e instanceof TypeError) ? 'PC není dostupné (zkontroluj Tailscale a Server v Nastavení). Můžeš přidat jídlo ručně.' : String(e.message || e); }
  if (ui.add) { a.busy = false; renderModal(); }
}
function entryFromRes(a) {
  const r = a.res, tot = sumItems(r.items), d = ui.date;
  const e = { id: a.editId || Math.random().toString(36).slice(2, 10), t: a.t || (d === todayStr() ? `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` : '12:00'),
    meal: a.meal, name: r.meal_name || r.items.map(i => i.name).filter(Boolean).join(', ') || 'Jídlo', items: r.items, confidence: r.confidence || null, notes: r.notes || '', sources: r.sources || [] };
  for (const k of NK) e[k] = tot[k] == null ? null : Math.round(tot[k] * 10) / 10;
  return e;
}
function addEntry(e, date = ui.date) { (mut(date).food ||= []).push(e); save(); }

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, d = ui.date, D = b.dataset;
  switch (a) {
    case 'tab': ui.tab = D.k; if (D.k === 'set') setTimeout(health, 0); break;
    case 'shift': ui.date = addDays(ui.date, +D.n); break;
    case 'gotoday': ui.date = todayStr(); break;
    case 'gotodate': ui.date = D.d; ui.tab = 'today'; break;
    case 'range': ui.range = D.k; break;
    case 'task': { const t = (mut(d).tasks ||= {}); t[D.k] = !t[D.k]; save(); break; }
    case 'fri': mut(d).fri = D.k; save(); break;
    case 'water': mut(d).water = Math.max(0, (getDay(d).water || 0) + +D.n); save(); break;
    case 'energy': mut(d).energy = getDay(d).energy === +D.n ? null : +D.n; save(); break;
    case 'add': openAdd(); return;
    case 'closeadd': ui.add = null; renderModal(); return;
    case 'meal': ui.add.meal = D.k; if (ui.add.res) { renderModal(); } else { document.querySelectorAll('[data-a=meal]').forEach(x => x.classList.toggle('on', x.dataset.k === D.k)); } return;
    case 'rmphoto': ui.add.img = null; renderModal(); return;
    case 'estimate': runEstimate(); return;
    case 'manual': ui.add.res = { meal_name: '', items: [blankItem()], confidence: null, notes: '', sources: [] }; renderModal(); return;
    case 'back': ui.add.res = null; renderModal(); return;
    case 'additem': ui.add.res.items.push(blankItem()); renderModal(); return;
    case 'delitem': ui.add.res.items.splice(+D.i, 1); renderModal(); return;
    case 'scale': { const x = +D.x; for (const it of ui.add.res.items) for (const k of NK) if (it[k] != null) it[k] = Math.round(it[k] * x * 10) / 10; renderModal(); return; }
    case 'saveentry': {
      const e = entryFromRes(ui.add);
      if (!e.items.length) { toast('Přidej aspoň jednu položku.'); return; }
      const day = mut(d);
      if (ui.add.editId) day.food = day.food.map(x => x.id === e.id ? e : x); else (day.food ||= []).push(e);
      ui.add = null; renderModal(); save(); toast('Přidáno'); break;
    }
    case 'savefav': { const e = entryFromRes(ui.add); S.favorites.push({ ...e, id: undefined }); S.meta.fu = Date.now(); save(); toast('Uloženo mezi oblíbené ★'); return; }
    case 'editentry': openAdd(getDay(d).food.find(x => x.id === D.id)); return;
    case 'delentry': if (confirm('Smazat záznam?')) { mut(d).food = getDay(d).food.filter(x => x.id !== D.id); save(); } break;
    case 'quickfav': case 'quickrec': {
      const src = a === 'quickfav' ? S.favorites[+D.i] : recents()[+D.i], e = JSON.parse(JSON.stringify(src));
      e.id = Math.random().toString(36).slice(2, 10); e.meal = defaultMeal(); e.t = d === todayStr() ? `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` : '12:00';
      addEntry(e); toast('Přidáno: ' + e.name); break;
    }
    case 'delfav': S.favorites.splice(+D.i, 1); S.meta.fu = Date.now(); save(); break;
    case 'srvtest': await sync(true); health(); return;
    case 'export': { const u = URL.createObjectURL(new Blob([JSON.stringify({ rev, state: S }, null, 1)], { type: 'application/json' })); const l = document.createElement('a'); l.href = u; l.download = `fitplan-${todayStr()}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
  }
  rerender();
});

document.addEventListener('input', ev => { if (ev.target.id === 'addtext' && ui.add) ui.add.text = ev.target.value; });

document.addEventListener('change', async ev => {
  const el = ev.target, c = el.dataset?.c; if (!c) return;
  const d = ui.date, a = ui.add, num = () => el.value === '' ? null : +String(el.value).replace(',', '.');
  if (c === 'photo') {
    try { a.img = await downscale(el.files[0]); a.err = ''; } catch (e) { a.err = String(e.message); }
    renderModal(); return;
  }
  if (a?.res && c === 'rname') { a.res.meal_name = el.value; return; }
  if (a?.res && c.startsWith('it_')) {
    const [, k, i] = c.match(/^it_([a-z_]+?)_(\d+)$/), it = a.res.items[+i];
    it[k] = (k === 'name' || k === 'amount') ? el.value : (num() ?? 0);
    const t = sumItems(a.res.items); $('#sumline').innerHTML = `<b>${nf(t.kcal)}</b> kcal · B ${nf(t.protein)} · S ${nf(t.carbs)} · T ${nf(t.fat)}`; return;
  }
  if (c === 'import') {
    try {
      const j = JSON.parse(await el.files[0].text()); const st = j.state || j;
      if (!st.profile || !st.days) throw new Error('Soubor nevypadá jako záloha.');
      if (!confirm('Přepsat všechna současná data touto zálohou?')) return;
      S = norm(st); S.meta = { pu: Date.now(), fu: Date.now() }; for (const k in S.days) S.days[k]._u = Date.now(); save(); toast('Import hotový'); rerender();
    } catch (e) { toast('Import selhal: ' + e.message); }
    return;
  }
  if (c.startsWith('p_')) {
    const k = c.slice(2);
    if (k === 'ramp') { const r = el.value.split(/[,;\s]+/).filter(Boolean).map(Number).filter(x => !isNaN(x) && x >= 0).slice(0, 20); S.profile.ramp = r.length ? r : [0]; }
    else if (k === 'startDate' || k === 'sex') { if (el.value) S.profile[k] = el.value; }
    else if (num() != null) S.profile[k] = num();
    S.meta.pu = Date.now(); save(); rerender(); return;
  }
  if (c === 'srv_url') { ls('wl_server', el.value.trim() || null); health(); sync(true); return; }
  if (c === 'srv_token') { ls('wl_token', el.value.trim() || null); health(); sync(true); return; }
  if (c.startsWith('tk_')) { S.profile.taskKcal[c.slice(3)] = num() ?? 0; S.meta.pu = Date.now(); save(); return; }
  const day = mut(d), map = { weight: 'weight', waist: 'waist', sleep: 'sleep', bf: 'bf' };
  if (map[c]) { const v = num(); if (v == null) delete day[c]; else day[c] = v; }
  else if (c === 'note') day.note = el.value;
  save(); rerender();
});

async function health() {
  const e = $('#health'); if (!e || !hasServer()) return;
  try {
    const r = await api('/api/health');
    if (r.status === 401) { e.textContent = 'Server odpovídá, ale token nesedí.'; return; }
    const h = await r.json(); e.textContent = `Server OK · model ${h.model} · claude CLI ${h.claude ? 'nalezen' : 'NENALEZEN'}`;
  } catch { e.textContent = 'Server neodpovídá (běží start.sh? je zapnutý Tailscale?).'; }
}

/* ---------- boot ---------- */
(async function () {
  await load(); rerender();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  sync(true);
})();
