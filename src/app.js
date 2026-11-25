/* ============================================================
   CRM Ralph — app
   Data: Supabase (tabellen party_types, parties, contacts, interactions, settings; RLS per eigenaar).
   Demo: voeg ?demo toe aan de URL voor een lokale versie met voorbeelddata (niets wordt opgeslagen).
   ============================================================ */
'use strict';

var CFG_URL = '%%SUPABASE_URL%%';
var CFG_KEY = '%%SUPABASE_KEY%%';
var DEFAULT_TYPES = ['Bedrijf', 'Private equity', 'M&A-adviseur', 'Due diligence-adviseur'];
var KINDS = ['Meeting', 'Call', 'Mail', 'Lunch', 'Overig'];
var INTERVALS = [1, 2, 3, 4, 6, 9, 12];
var STAGES = [
  { key: 'te_benaderen', title: 'Te benaderen' },
  { key: 'benaderd', title: 'Benaderd' },
  { key: 'in_gesprek', title: 'In gesprek' },
  { key: 'voorstel', title: 'Voorstel' },
  { key: 'gewonnen', title: 'Gewonnen', closed: true },
  { key: 'afgevallen', title: 'Afgevallen', closed: true }
];
var FOCUS = ['VC', 'MKB', 'Mid-cap', 'Large-cap'];
var STAGE = {}; STAGES.forEach(function (st, i) { st.i = i; STAGE[st.key] = st; });
var DEMO = /[?&]demo\b/.test(location.search);

/* ---------- hulpfuncties ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now()); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function todayIso() { return isoDate(today()); }
function parseDate(s) { if (!s) return null; var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addMonths(d, m) {
  var r = new Date(d.getFullYear(), d.getMonth() + m, 1);
  var last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), last)); return r;
}
function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
var MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function fmtDate(d, withYear) {
  if (!d) return '';
  if (typeof d === 'string') d = parseDate(d);
  var y = withYear === undefined ? d.getFullYear() !== today().getFullYear() : withYear;
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + (y ? ' ' + d.getFullYear() : '');
}
function fmtRel(d) {
  var n = daysBetween(today(), d);
  if (n === 0) return 'vandaag';
  if (n === 1) return 'morgen';
  if (n === -1) return 'gisteren';
  if (n < 0) return (-n) + ' dagen te laat';
  if (n < 14) return 'over ' + n + ' dagen';
  if (n < 60) return 'over ' + Math.round(n / 7) + ' weken';
  return fmtDate(d);
}
function initials(s) { var p = String(s || '').trim().split(/\s+/).filter(Boolean); if (!p.length) return '?'; return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function icon(name, cls) { return '<svg class="icon' + (cls ? ' ' + cls : '') + '"><use href="#i-' + name + '"/></svg>'; }
function plural(n, one, more) { return n + ' ' + (n === 1 ? one : more); }
function cmpName(a, b) { return norm(a).localeCompare(norm(b), 'nl'); }

/* ============================================================
   OPSLAG: Supabase of demo
   ============================================================ */
var TABLES = ['party_types', 'parties', 'contacts', 'interactions', 'settings'];
var Store = {
  sb: null, user: null,
  init: function () {
    if (DEMO) return;
    var url = CFG_URL, key = CFG_KEY;
    if (url.indexOf('%%') === 0 || key.indexOf('%%') === 0) {
      try { var c = JSON.parse(localStorage.getItem('crm.config') || 'null'); if (c) { url = c.url; key = c.key; } } catch (e) {}
    }
    if (!url || url.indexOf('%%') === 0 || !key || key.indexOf('%%') === 0) return 'config';
    this.sb = supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'crm.auth' } });
  },
  session: async function () {
    if (DEMO) return { user: { email: 'demo@voorbeeld.nl', id: 'demo' } };
    var r = await this.sb.auth.getSession(); return r.data.session;
  },
  signIn: async function (email, pw) { var r = await this.sb.auth.signInWithPassword({ email: email, password: pw }); if (r.error) throw r.error; return r.data.session; },
  signUp: async function (email, pw) {
    var r = await this.sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } });
    if (r.error) throw r.error; return r.data;
  },
  setName: async function (name) {
    if (DEMO) { this.user.user_metadata = Object.assign({}, this.user.user_metadata, { display_name: name }); return this.user; }
    var r = await this.sb.auth.updateUser({ data: { display_name: name } }); if (r.error) throw r.error; this.user = r.data.user; return this.user;
  },
  signOut: async function () { if (!DEMO) await this.sb.auth.signOut(); },
  loadAll: async function () {
    if (DEMO) return JSON.parse(JSON.stringify(Demo.data));
    var self = this, out = {};
    await Promise.all(TABLES.map(async function (t) {
      var r = await self.sb.from(t).select('*');
      if (r.error) throw r.error; out[t] = r.data;
    }), (async function () {
      var r = await self.sb.from('parties').select('pipeline_stage,focus,markets').limit(1);
      out.needsMigration = !!r.error;
    })());
    return out;
  },
  insert: async function (t, row) {
    if (DEMO) { row = Object.assign({ id: uid(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, row); Demo.data[t].push(row); return JSON.parse(JSON.stringify(row)); }
    var r = await this.sb.from(t).insert(row).select().single(); if (r.error) throw r.error; return r.data;
  },
  insertMany: async function (t, rows) {
    if (!rows.length) return [];
    if (DEMO) { var self = this; return Promise.all(rows.map(function (r) { return self.insert(t, r); })); }
    var r = await this.sb.from(t).insert(rows).select(); if (r.error) throw r.error; return r.data;
  },
  update: async function (t, id, patch) {
    if (t !== 'settings') patch.updated_at = new Date().toISOString();
    if (t === 'party_types' || t === 'interactions') delete patch.updated_at;
    if (DEMO) { var row = Demo.data[t].find(function (x) { return x.id === id; }); Object.assign(row, patch); return JSON.parse(JSON.stringify(row)); }
    var r = await this.sb.from(t).update(patch).eq('id', id).select().single(); if (r.error) throw r.error; return r.data;
  },
  remove: async function (t, id) {
    if (DEMO) { Demo.data[t] = Demo.data[t].filter(function (x) { return x.id !== id; }); return; }
    var r = await this.sb.from(t).delete().eq('id', id); if (r.error) throw r.error;
  },
  saveSettings: async function (patch) {
    patch.updated_at = new Date().toISOString();
    if (DEMO) { Object.assign(Demo.data.settings[0], patch); return JSON.parse(JSON.stringify(Demo.data.settings[0])); }
    var r = await this.sb.from('settings').upsert(Object.assign({ owner_id: this.user.id }, patch)).select().single();
    if (r.error) throw r.error; return r.data;
  }
};

/* ---------- demodata: verzonnen namen, alleen in ?demo ---------- */
var Demo = { data: null, build: function () {
  var t = DEFAULT_TYPES.map(function (n, i) { return { id: 't' + i, name: n, sort: i }; });
  var P = [['Voorbeeld Klinieken', 0, 'Utrecht'], ['Noordlicht Capital', 1, 'Amsterdam'], ['Brugwerk Partners', 2, 'Rotterdam'], ['Kade & Co Transaction Services', 3, 'Amsterdam'], ['Heuvelrug Zorggroep', 0, 'Zeist'], ['Delta Equity', 1, 'Den Haag']];
  var parties = P.map(function (p, i) { return { id: 'p' + i, name: p[0], type_id: 't' + p[1], city: p[2], website: '', notes: '', pipeline_stage: null, pipeline_next_step: null, pipeline_next_date: null, pipeline_since: null, focus: [['MKB'], ['MKB', 'Mid-cap'], ['Mid-cap'], ['Mid-cap', 'Large-cap'], ['MKB'], ['VC', 'MKB']][i], markets: [['Zorg'], ['Zorg', 'Software'], ['Zorg', 'Industrie'], ['Zorg'], ['Zorg', 'Tandartsen'], ['Software']][i], created_at: '2026-06-01T09:00:00Z', updated_at: '2026-06-01T09:00:00Z' }; });
  [['Zonnehof Kliniekgroep', 0, 'Arnhem', 'te_benaderen', 'Intro-mail sturen', 3], ['Rivierland Capital', 1, 'Nijmegen', 'te_benaderen', null, null], ['Oostpoort Dental', 0, 'Enschede', 'benaderd', 'Nabellen', -2], ['Meridiaan Partners', 2, 'Utrecht', 'in_gesprek', 'Tweede gesprek', 9], ['Lindeboom Zorg', 0, 'Breda', 'voorstel', 'Voorstel nabespreken', 5], ['Polder Groep', 0, 'Almere', 'gewonnen', null, null]].forEach(function (x, i) {
    parties.push({ id: 'q' + i, name: x[0], type_id: 't' + x[1], city: x[2], website: '', notes: '', pipeline_stage: x[3], pipeline_next_step: x[4], pipeline_next_date: x[5] === null ? null : isoDate(addDays(today(), x[5])), pipeline_since: isoDate(addDays(today(), -20 - i * 5)), focus: ['MKB'], markets: [['Zorg'], ['Zorg'], ['Tandartsen'], ['Zorg', 'Software'], ['Zorg'], ['Industrie']][i], created_at: '2026-06-01T09:00:00Z', updated_at: '2026-06-01T09:00:00Z' });
  });
  var C = [['Anna', 'de Vries', 'p0', 'CFO', true, 3, -120], ['Bram', 'Jansen', 'p1', 'Partner', true, 3, -95], ['Chris', 'Bakker', 'p1', 'Investment manager', true, 2, -50], ['Daan', 'Visser', 'p2', 'Director', true, 3, -86], ['Eva', 'Smit', 'p3', 'Partner', true, 6, -20], ['Fleur', 'Mulder', 'p4', 'CEO', false, 3, -200], ['Gijs', 'Meijer', 'p5', 'Associate', true, 3, null], ['Hanna', 'Bos', 'p3', 'Manager', false, 3, -10], ['Ivo', 'Peters', 'p5', 'Managing partner', true, 4, -118]];
  var contacts = [], inter = [];
  C.push(['Kim', 'van Dijk', 'q2', 'Directeur', false, 3, null], ['Lars', 'de Groot', 'q3', 'Partner', false, 3, null]);
  C.forEach(function (c, i) {
    contacts.push({ id: 'c' + i, first_name: c[0], last_name: c[1], party_id: c[2], role: c[3], email: c[0].toLowerCase() + '@voorbeeld.nl', phone: '', linkedin: '', notes: '', recurring: c[4], interval_months: c[5], snooze_until: null, archived: false, created_at: '2026-05-01T09:00:00Z', updated_at: '2026-05-01T09:00:00Z' });
    if (c[6] !== null) inter.push({ id: 'x' + i, contact_id: 'c' + i, date: isoDate(addDays(today(), c[6])), kind: KINDS[i % 4], notes: i % 2 ? 'Bijgepraat over de markt en lopende trajecten.' : '', created_at: '2026-05-01T09:00:00Z' });
  });
  inter.push({ id: 'x99', contact_id: 'c0', date: isoDate(addDays(today(), -200)), kind: 'Lunch', notes: 'Kennismaking.', created_at: '2026-05-01T09:00:00Z' });
  this.data = { party_types: t, parties: parties, contacts: contacts, interactions: inter, settings: [{ owner_id: 'demo', default_interval_months: 3 }] };
} };

/* ============================================================
   STAAT EN AFGELEIDE GEGEVENS
   ============================================================ */
var S = { types: [], parties: [], contacts: [], interactions: [], settings: { default_interval_months: 3 }, loadedAt: 0,
  q: '', needsMigration: false, showClosed: false, filters: { ctype: '', cparty: '', crec: false, crole: '', cdue: '', ptype: '', afilter: 'alles', pfocus: '', pmarket: '', pstage: '', pknown: '' },
  sort: { contacten: { k: 'naam', d: 1 }, partijen: { k: 'partij', d: 1 } } };
try { var savedSort = JSON.parse(localStorage.getItem('crm.sort') || 'null'); if (savedSort) Object.keys(S.sort).forEach(function (v) { if (savedSort[v] && savedSort[v].k) S.sort[v] = { k: savedSort[v].k, d: savedSort[v].d === -1 ? -1 : 1 }; }); } catch (e) {}

function setData(d) {
  S.types = d.party_types.slice().sort(function (a, b) { return (a.sort - b.sort) || cmpName(a.name, b.name); });
  S.parties = d.parties; S.contacts = d.contacts.filter(function (c) { return !c.archived; });
  S.interactions = d.interactions; S.settings = d.settings[0] || { default_interval_months: 3 };
  S.needsMigration = !!d.needsMigration;
  S.loadedAt = Date.now(); index();
}
var IX = {};
function index() {
  IX.type = {}; S.types.forEach(function (t) { IX.type[t.id] = t; });
  IX.party = {}; S.parties.forEach(function (p) { IX.party[p.id] = p; });
  IX.contact = {}; S.contacts.forEach(function (c) { IX.contact[c.id] = c; });
  IX.byContact = {}; S.interactions.forEach(function (x) { (IX.byContact[x.contact_id] = IX.byContact[x.contact_id] || []).push(x); });
  Object.keys(IX.byContact).forEach(function (k) { IX.byContact[k].sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.created_at < b.created_at ? 1 : -1); }); });
  IX.byParty = {}; S.contacts.forEach(function (c) { if (c.party_id) (IX.byParty[c.party_id] = IX.byParty[c.party_id] || []).push(c); });
}
function fullName(c) { return [c.first_name, c.last_name].filter(Boolean).join(' '); }
function partyOf(c) { return c.party_id ? IX.party[c.party_id] : null; }
function typeOfParty(p) { return p && p.type_id ? IX.type[p.type_id] : null; }
function lastContact(c) { var l = IX.byContact[c.id]; return l && l.length ? parseDate(l[0].date) : null; }
/* volgende keer = laatste contact + interval, of later als uitgesteld; zonder contactmoment: geen datum */
function nextDue(c) {
  if (!c.recurring) return null;
  var last = lastContact(c);
  var due = last ? addMonths(last, c.interval_months || 3) : null;
  var snooze = parseDate(c.snooze_until);
  if (snooze && (!due || snooze > due)) due = snooze;
  return due;
}
/* groep in de actielijst */
function bucket(c) {
  var d = nextDue(c);
  if (!d) return 'none';
  var n = daysBetween(today(), d);
  if (n < 0) return 'late';
  if (n <= 7) return 'week';
  if (n <= 30) return 'month';
  return 'later';
}
var BUCKETS = [
  { key: 'late', title: 'Te laat', cls: 'due--late' },
  { key: 'week', title: 'Komende 7 dagen', cls: 'due--soon' },
  { key: 'month', title: 'Komende 30 dagen', cls: 'due--month' },
  { key: 'none', title: 'Nog geen contactmoment vastgelegd', cls: 'due--none' },
  { key: 'later', title: 'Later', cls: 'due--later' }
];
function dueLabel(c) {
  if (!c.recurring) return '<span class="muted">—</span>';
  var d = nextDue(c), b = bucket(c);
  if (!d) return '<span class="due due--none">Nog niet gesproken</span>';
  var cls = { late: 'due--late', week: 'due--soon', month: 'due--month', later: 'due--later' }[b];
  return '<span class="due ' + cls + '" title="' + esc(fmtDate(d, true)) + '">' + esc(fmtRel(d)) + '</span>';
}
function actionContacts() { return S.contacts.filter(function (c) { return c.recurring; }); }
function countBucket(k) { return actionContacts().filter(function (c) { return bucket(c) === k; }).length; }
function matchQ(c) {
  if (!S.q) return true;
  var p = partyOf(c), q = norm(S.q);
  return [fullName(c), c.role, c.email, c.phone, c.notes, p && p.name].some(function (v) { return norm(v).indexOf(q) >= 0; });
}
function matchQParty(p) {
  if (!S.q) return true; var q = norm(S.q);
  if ([p.name, p.city, p.notes].some(function (v) { return norm(v).indexOf(q) >= 0; })) return true;
  return (IX.byParty[p.id] || []).some(function (c) { return norm(fullName(c)).indexOf(q) >= 0; });
}

/* ============================================================
   ROUTER EN VIEWS
   ============================================================ */
var route = { view: 'actielijst', id: null };
function go(hash) { if (location.hash === '#' + hash) render(); else location.hash = hash; }
function parseHash() {
  var h = location.hash.replace(/^#/, '') || 'actielijst', p = h.split('/');
  route = { view: p[0], id: p[1] ? decodeURIComponent(p[1]) : null, extra: p[2] ? decodeURIComponent(p[2]) : null };
  if (['actielijst', 'contacten', 'partijen', 'pipeline', 'instellingen', 'contact', 'partij'].indexOf(route.view) < 0) route.view = 'actielijst';
}
function navKey() { return route.view === 'contact' ? 'contacten' : route.view === 'partij' ? (lastList === 'pipeline' ? 'pipeline' : 'partijen') : route.view; }
var lastList = 'partijen';
function render() {
  if (Auto.timer) autosaveNow(); /* openstaande wijziging eerst uit het formulier lezen */
  parseHash();
  var main = $('#main');
  var html;
  try {
    if (['partijen', 'pipeline'].indexOf(route.view) >= 0) lastList = route.view;
    html = ({ pipeline: vPipeline, actielijst: vActielijst, contacten: vContacten, partijen: vPartijen, instellingen: vInstellingen, contact: vContact, partij: vPartij })[route.view]();
  } catch (e) { console.error(e); html = '<section class="container"><div class="actionbar"><h1 class="actionbar__title">Er ging iets mis</h1></div><div class="alert alert--danger">' + icon('alert', 'alert__icon') + '<div class="alert__body">' + esc(e.message) + '</div></div></section>'; }
  main.innerHTML = html;
  var k = navKey();
  $all('[data-nav]').forEach(function (a) {
    var on = a.dataset.nav === k;
    a.classList.toggle(a.classList.contains('tabbar__item') ? 'tabbar__item--active' : a.classList.contains('sidenav__subitem-link') ? 'sidenav__subitem-link--active' : 'sidenav__item-link--active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  var late = countBucket('late') + countBucket('week');
  $all('[data-count="actie"]').forEach(function (b) { b.textContent = late; b.classList.toggle('hidden', !late); });
  var pl = pipelineDue();
  $all('[data-count="pipeline"]').forEach(function (b) { b.textContent = pl; b.classList.toggle('hidden', !pl); });
  document.title = ({ pipeline: 'Sales pipeline', actielijst: 'Actielijst', contacten: 'Contacten', partijen: 'Partijen', instellingen: 'Instellingen', contact: 'Contact', partij: 'Partij' })[route.view] + ' · CRM';
  var focusEl = $('[data-autofocus]', main); if (focusEl) focusEl.focus();
}

/* ---------- gedeelde bouwstenen ---------- */
function actionbar(title, actions) { return '<div class="actionbar"><h1 class="actionbar__title">' + esc(title) + '</h1><div class="actionbar__actions">' + (actions || '') + '</div></div>'; }
function personCell(c, sub, subCls) {
  return '<div class="person"><span class="person__avatar avatar tone-' + contactTone(c) + '">' + esc(initials(fullName(c))) + '</span><span class="person__text"><span class="person__name">' + esc(fullName(c)) + '</span>' + (sub ? ' <span class="person__sub' + (subCls ? ' ' + subCls : '') + '">· ' + esc(sub) + '</span>' : '') + '</span></div>';
}
function partyCell(p, stageCls) { return '<div class="person"><span class="person__avatar person__avatar--party">' + icon('building') + '</span><span class="person__text person__name">' + esc(p.name) + '</span>' + (stageCls ? '<span class="' + stageCls + '">' + stageLabel(p) + '</span>' : stageLabel(p)) + '</div>'; }
function spokenBtn(c) { return '<button class="btn btn--primary" type="button" data-act="spoken" data-id="' + esc(c.id) + '" title="Contactmoment vastleggen">' + icon('check', 'icon--14') + '<span class="btn__text">Gesproken</span></button>'; }
/* Mail opstellen via mailto: opent het standaard mailprogramma (Outlook op de pc) */
function mailUrl(c) {
  var url = 'mailto:' + encodeURIComponent(c.email).replace(/%40/g, '@');
  if (c.first_name) url += '?body=' + encodeURIComponent('Beste ' + c.first_name + ',\r\n\r\n');
  return url;
}
function mailBtn(c, iconOnly) {
  if (!c.email) return '';
  return '<a class="btn' + (iconOnly ? ' btn--icon-only' : '') + '" href="' + esc(mailUrl(c)) + '" title="Mail opstellen in Outlook aan ' + esc(c.email) + '" aria-label="Mail opstellen in Outlook">' + icon('inbox', 'icon--14') + (iconOnly ? '' : '<span class="btn__text">Mail</span>') + '</a>';
}
function snoozeMenu(c) {
  return '<div class="drpdwn"><button class="btn" type="button" aria-haspopup="menu" aria-expanded="false" data-drpdwn title="Uitstellen">' + icon('clock', 'icon--14') + '<span class="btn__text">Uitstellen</span>' + icon('chevron-down', 'btn__icon-right') + '</button>' +
    '<div class="drpdwn__menu drpdwn__menu--right" role="menu">' +
    [[7, '1 week'], [14, '2 weken'], [30, '1 maand'], [91, '3 maanden']].map(function (o) { return '<button class="drpdwn__item" role="menuitem" data-act="snooze" data-id="' + esc(c.id) + '" data-days="' + o[0] + '">' + esc(o[1]) + '</button>'; }).join('') +
    '<button class="drpdwn__item" role="menuitem" data-act="snooze-date" data-id="' + esc(c.id) + '">' + icon('clock') + 'Kies een datum…</button>' +
    (c.snooze_until ? '<hr class="drpdwn__divider"><button class="drpdwn__item" role="menuitem" data-act="unsnooze" data-id="' + esc(c.id) + '">Uitstel opheffen</button>' : '') +
    '</div></div>';
}
function emptyState(title, text, btn) { return '<div class="empty"><div class="empty__title">' + esc(title) + '</div><div>' + esc(text) + '</div>' + (btn || '') + '</div>'; }
function typeOptions(sel, withAll) {
  return (withAll ? '<option value="">' + esc(withAll) + '</option>' : '') + S.types.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('');
}
function partyOptions(sel, withNone) {
  var ps = S.parties.slice().sort(function (a, b) { return cmpName(a.name, b.name); });
  return (withNone ? '<option value="">' + esc(withNone) + '</option>' : '') + ps.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
}
function searchField(id, ph) {
  return '<span class="text-field filter-search only-m">' + icon('search') + '<input class="text-field__input" type="search" id="' + id + '" data-q placeholder="' + esc(ph) + '" value="' + esc(S.q) + '"></span>';
}

function kindIcon(k) { return { Meeting: 'briefcase', Call: 'bell', Mail: 'inbox', Lunch: 'gift' }[k] || 'check'; }

/* ---------- ACTIELIJST ---------- */
/* kleur per partijtype: volgorde van de types (Bedrijf blauw, PE paars, M&A groen, DD oker) */
var TONES = ['b', 'p', 'g', 'y', 'm', 'n'];
function typeTone(t) {
  if (!t) return 'n';
  var i = S.types.indexOf(t); if (i < 0) i = S.types.findIndex(function (x) { return x.id === t.id; });
  return TONES[i < 0 ? TONES.length - 1 : i % TONES.length];
}
function contactTone(c) { return typeTone(typeOfParty(partyOf(c))); }
function typeDot(t) { return '<span class="tdot tone-' + typeTone(t) + '" aria-hidden="true"></span>'; }
function displayName() { var m = Store.user && Store.user.user_metadata; return m && m.display_name ? String(m.display_name).trim() : ''; }
function showUserName() { $('#user-name').textContent = displayName() || (Store.user ? Store.user.email : ''); }
function greeting() {
  var h = new Date().getHours(), g = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  var n = displayName();
  return n ? g + ' ' + n : g;
}
var TILES = [
  { key: 'late', title: 'Te laat', sub: 'Termijn verstreken' },
  { key: 'week', title: 'Komende 7 dagen', sub: 'Deze week spreken' },
  { key: 'month', title: 'Komende 30 dagen', sub: 'Binnen een maand' },
  { key: 'none', title: 'Nog niet gesproken', sub: 'Geen contactmoment vastgelegd' }
];
function actionRow(c) {
  var p = partyOf(c), t = typeOfParty(p), last = lastContact(c);
  return '<div class="arow" data-href="#contact/' + esc(c.id) + '">' +
    '<span class="avatar tone-' + contactTone(c) + '">' + esc(initials(fullName(c))) + '</span>' +
    '<div class="arow__main"><div class="arow__name"><a href="#contact/' + esc(c.id) + '">' + esc(fullName(c)) + '</a>' +
    '<span class="recurring-mark" title="Herhaaldelijk spreken">' + icon('clock', 'icon--12') + 'elke ' + esc(c.interval_months) + ' mnd' + (c.snooze_until && parseDate(c.snooze_until) >= today() ? ' · uitgesteld' : '') + '</span></div>' +
    '<div class="arow__sub">' + (c.role ? '<span class="arow__role">' + esc(c.role) + '</span>' : '') + (p ? (c.role ? '<span class="arow__role" aria-hidden="true">·</span>' : '') + typeDot(t) + '<span class="arow__party">' + esc(p.name) + '</span>' : '') + '</div></div>' +
    '<div class="arow__last">' + (last ? 'Laatst gesproken ' + esc(fmtDate(last)) : 'Nog geen contactmoment') + '</div>' +
    '<div class="arow__due">' + dueLabel(c) + '</div>' +
    '<div class="row-actions arow__actions">' + mailBtn(c, true) + spokenBtn(c) + snoozeMenu(c) + '</div></div>';
}
function vActielijst() {
  var f = route.id && ['late', 'none', 'week', 'month', 'later'].indexOf(route.id) >= 0 ? route.id : 'alles';
  var all = actionContacts().filter(matchQ);
  var nLate = countBucket('late'), nWeek = countBucket('week');
  var lead = !actionContacts().length ? 'Zet bij een contact "Herhaaldelijk spreken" aan, dan komt hij op deze lijst.'
    : nLate + nWeek ? 'Je hebt ' + plural(nLate + nWeek, 'persoon', 'mensen') + ' om weer te spreken' + (nLate ? ', waarvan ' + nLate + ' te laat.' : ' deze week.')
    : 'Je bent bij. Deze week hoeft niemand gesproken te worden.';
  var tiles = '<div class="tiles">' + TILES.map(function (b) {
    var on = f === b.key;
    return '<a class="tile' + (on ? ' tile--on' : '') + '" href="#actielijst' + (on ? '' : '/' + b.key) + '"' + (on ? ' aria-current="true"' : '') + '>' +
      '<span class="tile__label"><span class="tile__dot tile__dot--' + b.key + '" aria-hidden="true"></span>' + esc(b.title) + '</span>' +
      '<span class="tile__count">' + countBucket(b.key) + '</span><span class="tile__sub">' + esc(b.sub) + '</span></a>';
  }).join('') + '</div>';
  var groups = '', shown = 0;
  BUCKETS.forEach(function (b) {
    if (f !== 'alles' && f !== b.key) return;
    var list = all.filter(function (c) { return bucket(c) === b.key; }).sort(function (x, y) { return (nextDue(x) || 0) - (nextDue(y) || 0) || cmpName(fullName(x), fullName(y)); });
    if (!list.length) return;
    shown += list.length;
    groups += '<section class="base-container alist"><div class="alist__head"><h2 class="alist__title">' + esc(b.title) + '</h2><span class="due ' + b.cls + '">' + list.length + '</span></div>' + list.map(actionRow).join('') + '</section>';
  });
  if (!shown) groups = '<div class="base-container">' + (actionContacts().length ? emptyState('Niets in deze selectie', S.q ? 'Geen treffers voor "' + S.q + '".' : 'Hier staat nu niemand.', f !== 'alles' ? '<button class="btn" type="button" data-href="#actielijst">Alles tonen</button>' : '') : emptyState('De actielijst is leeg', 'Zet bij een contact "Herhaaldelijk spreken" aan, dan verschijnt hij hier.', '<button class="btn btn--primary" type="button" data-href="#contacten">Naar contacten</button>')) + '</div>';
  return '<section class="container">' +
    '<div class="hello"><div class="hello__text"><h1 class="hello__title">' + esc(greeting()) + '</h1><p class="hello__lead">' + esc(lead) + '</p></div>' +
    '<div class="hello__actions"><button class="btn btn--success" type="button" data-href="#contact/nieuw">' + icon('plus', 'icon--14') + '<span class="btn__text">Contact toevoegen</span></button></div></div>' +
    tiles +
    '<div class="filterbar">' + searchField('q-a', 'Zoek in de actielijst') + (f !== 'alles' ? '<a class="btn" href="#actielijst">' + icon('chevron-left', 'icon--14') + '<span class="btn__text">Alles tonen</span></a>' : '') +
    '<span class="filterbar__count">' + plural(shown, 'contact', 'contacten') + '</span></div>' + groups + '</section>';
}

/* ---------- SORTEREN EN FILTEREN ---------- */
/* sorteer op kolom: lege waarden altijd onderaan, bij gelijke waarde op naam */
function sortList(list, view, getters, tiebreak) {
  var st = S.sort[view], get = getters[st.k] || getters[Object.keys(getters)[0]];
  return list.map(function (x) { return { x: x, v: get(x) }; }).sort(function (a, b) {
    var ea = a.v === null || a.v === undefined || a.v === '', eb = b.v === null || b.v === undefined || b.v === '';
    if (ea || eb) return ea && eb ? tiebreak(a.x, b.x) : ea ? 1 : -1;
    var r = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : cmpName(String(a.v), String(b.v));
    return r ? r * st.d : tiebreak(a.x, b.x);
  }).map(function (o) { return o.x; });
}
function sortTh(view, key, label, cls) {
  var st = S.sort[view], on = st.k === key;
  return '<th' + (cls ? ' class="' + cls + '"' : '') + ' aria-sort="' + (on ? (st.d === 1 ? 'ascending' : 'descending') : 'none') + '"><button class="th-sort' + (on ? ' th-sort--on' : '') + '" type="button" data-sort="' + view + ':' + key + '" title="Sorteren op ' + esc(label.toLowerCase()) + '"><span>' + esc(label) + '</span>' + icon(on && st.d === -1 ? 'chevron-up' : 'chevron-down', 'icon--12 th-sort__icon') + '</button></th>';
}
function setSort(view, key) {
  var st = S.sort[view];
  S.sort[view] = st.k === key ? { k: key, d: -st.d } : { k: key, d: 1 };
  try { localStorage.setItem('crm.sort', JSON.stringify(S.sort)); } catch (e) {}
  render();
}
function sortSelect(view, opts) {
  var st = S.sort[view], cur = st.k + ':' + st.d;
  return '<label class="sort-m"><select class="select" data-sort-select="' + view + '" aria-label="Sorteren">' + opts.map(function (o) {
    return [1, -1].map(function (d) { var v = o[0] + ':' + d; return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>Sorteer: ' + esc(o[1]) + (d === 1 ? ' ↑' : ' ↓') + '</option>'; }).join('');
  }).join('') + '</select></label>';
}
function filterToggle(key, label) {
  var on = !!S.filters[key];
  return '<button class="filter-toggle' + (on ? ' filter-toggle--on' : '') + '" type="button" data-filter-toggle="' + key + '" aria-pressed="' + on + '">' + icon(on ? 'check' : 'clock', 'icon--12') + esc(label) + '</button>';
}
function clearFilters(keys) {
  return keys.some(function (k) { return S.filters[k]; }) ? '<button class="filter-clear" type="button" data-clear-filters="' + keys.join(',') + '">Filters wissen</button>' : '';
}
function allRoles() { var m = {}; S.contacts.forEach(function (c) { if (c.role && c.role.trim()) m[norm(c.role)] = m[norm(c.role)] || c.role.trim(); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(cmpName); }
var DUE_FILTERS = [['late', 'Te laat'], ['week', 'Komende 7 dagen'], ['month', 'Komende 30 dagen'], ['later', 'Later'], ['none', 'Nog niet gesproken'], ['off', 'Niet herhaaldelijk']];

/* ---------- CONTACTEN ---------- */
function vContacten() {
  var F = S.filters;
  var list = S.contacts.filter(function (c) {
    if (!matchQ(c)) return false;
    var p = partyOf(c);
    if (F.ctype && (!p || p.type_id !== F.ctype)) return false;
    if (F.cparty && c.party_id !== F.cparty) return false;
    if (F.crec && !c.recurring) return false;
    if (F.crole && norm(c.role) !== norm(F.crole)) return false;
    if (F.cdue && (F.cdue === 'off' ? c.recurring : !c.recurring || bucket(c) !== F.cdue)) return false;
    return true;
  });
  var byName = function (a, b) { return cmpName(a.last_name + ' ' + a.first_name, b.last_name + ' ' + b.first_name); };
  list = sortList(list, 'contacten', {
    naam: function (c) { return (c.last_name || '') + ' ' + (c.first_name || ''); },
    functie: function (c) { return c.role; },
    partij: function (c) { var p = partyOf(c); return p ? p.name : ''; },
    type: function (c) { var t = typeOfParty(partyOf(c)); return t ? t.sort : null; },
    last: function (c) { var d = lastContact(c); return d ? d.getTime() : null; },
    rec: function (c) { return c.recurring ? +c.interval_months : null; },
    due: function (c) { if (!c.recurring) return null; var d = nextDue(c); return d ? d.getTime() : -1e15; }
  }, byName);
  var roles = allRoles();
  if (F.crole && !roles.some(function (r) { return norm(r) === norm(F.crole); })) F.crole = '';
  var filters = '<div class="filterbar">' + searchField('q-c', 'Zoek een contact') +
    '<select class="select" data-filter="ctype" aria-label="Partijtype">' + typeOptions(F.ctype, 'Alle partijtypes') + '</select>' +
    '<select class="select" data-filter="cparty" aria-label="Partij">' + partyOptions(F.cparty, 'Alle partijen') + '</select>' +
    '<select class="select" data-filter="crole" aria-label="Functie"><option value="">Alle functies</option>' + roles.map(function (r) { return '<option' + (norm(r) === norm(F.crole) ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
    '<select class="select" data-filter="cdue" aria-label="Volgende keer"><option value="">Elke opvolging</option>' + DUE_FILTERS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === F.cdue ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' +
    filterToggle('crec', 'Alleen herhaaldelijk') + clearFilters(['ctype', 'cparty', 'crole', 'cdue', 'crec']) +
    sortSelect('contacten', [['naam', 'naam'], ['functie', 'functie'], ['partij', 'partij'], ['last', 'laatst gesproken'], ['due', 'volgende keer']]) +
    '<span class="filterbar__count">' + plural(list.length, 'contact', 'contacten') + '</span></div>';
  var body = list.length ? '<div class="table-container"><table class="table table--stack table--sortable"><colgroup><col class="c-name"><col class="hide-m"><col class="hide-m"><col class="c-type hide-m"><col class="c-date hide-m"><col class="c-rec hide-m"><col class="c-due"></colgroup><thead><tr>' + sortTh('contacten', 'naam', 'Naam') + sortTh('contacten', 'functie', 'Functie', 'hide-m') + sortTh('contacten', 'partij', 'Partij', 'hide-m') + sortTh('contacten', 'type', 'Type', 'hide-m') + sortTh('contacten', 'last', 'Laatst gesproken', 'hide-m') + sortTh('contacten', 'rec', 'Herhaaldelijk', 'hide-m') + sortTh('contacten', 'due', 'Volgende keer') + '</tr></thead><tbody>' +
    list.map(function (c) {
      var p = partyOf(c), t = typeOfParty(p), last = lastContact(c);
      return '<tr class="table__row--link" data-href="#contact/' + esc(c.id) + '"><td>' + personCell(c, c.role, 'person__sub--m') + '</td><td class="hide-m">' + (c.role ? esc(c.role) : '<span class="muted">—</span>') + '</td><td class="hide-m">' + esc(p ? p.name : '') + '</td><td class="hide-m">' + esc(t ? t.name : '') + '</td>' +
        '<td class="hide-m">' + (last ? esc(fmtDate(last)) : '<span class="muted">—</span>') + '</td><td class="hide-m">' + (c.recurring ? '<span class="recurring-mark">' + icon('check') + esc(c.interval_months) + ' mnd</span>' : '<span class="muted">Nee</span>') + '</td><td>' + dueLabel(c) + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="base-container">' + (S.contacts.length ? emptyState('Geen contacten gevonden', 'Pas de filters of de zoekterm aan.') : emptyState('Nog geen contacten', 'Voeg je eerste contact toe, of importeer een bestand via Instellingen.', '<button class="btn btn--success" type="button" data-href="#contact/nieuw">' + icon('plus', 'icon--14') + '<span class="btn__text">Contact toevoegen</span></button>')) + '</div>';
  return '<section class="container container--wide">' + actionbar('Contacten', '<button class="btn btn--success" type="button" data-href="#contact/nieuw">' + icon('plus', 'icon--14') + '<span class="btn__text">Contact toevoegen</span></button>') + filters + body + '</section>';
}

/* ---------- PARTIJEN ---------- */
function vPartijen() {
  var ft = route.id && IX.type[route.id] ? route.id : '';
  var tabs = '<div class="tab-group mb16" role="tablist">' + [['', 'Alle']].concat(S.types.map(function (t) { return [t.id, t.name]; })).map(function (t) {
    var n = S.parties.filter(function (p) { return !t[0] || p.type_id === t[0]; }).length;
    return '<a class="tab' + (t[0] === ft ? ' tab--active' : '') + '" role="tab" href="#partijen' + (t[0] ? '/' + esc(t[0]) : '') + '">' + esc(t[1]) + '<span class="badge" style="margin-left:6px">' + n + '</span></a>';
  }).join('') + '</div>';
  var F = S.filters, markets = allMarkets();
  if (F.pmarket && !markets.some(function (m) { return norm(m) === norm(F.pmarket); })) F.pmarket = '';
  var list = S.parties.filter(function (p) {
    return (!ft || p.type_id === ft) && matchQParty(p) && (!F.pfocus || arr(p.focus).indexOf(F.pfocus) >= 0) && (!F.pmarket || arr(p.markets).some(function (m) { return norm(m) === norm(F.pmarket); })) && (!F.pstage || (F.pstage === 'geen' ? !inPipeline(p) : p.pipeline_stage === F.pstage)) && (!F.pknown || (F.pknown === 'ja') === !!(IX.byParty[p.id] || []).length);
  });
  var lastOfParty = function (p) { return (IX.byParty[p.id] || []).map(lastContact).filter(Boolean).sort(function (a, b) { return b - a; })[0] || null; };
  list = sortList(list, 'partijen', {
    partij: function (p) { return p.name; },
    type: function (p) { var t = typeOfParty(p); return t ? t.sort : null; },
    status: function (p) { return inPipeline(p) ? STAGE[p.pipeline_stage].i : null; },
    focus: function (p) { var f = sortedFocus(p); return f.length ? FOCUS.indexOf(f[0]) : null; },
    markten: function (p) { return arr(p.markets).slice().sort(cmpName)[0] || ''; },
    wie: function (p) { var n = (IX.byParty[p.id] || []).length; return n || null; },
    last: function (p) { var d = lastOfParty(p); return d ? d.getTime() : null; }
  }, function (a, b) { return cmpName(a.name, b.name); });
  var pfilters = S.needsMigration ? '' : '<div class="filterbar">' + searchField('q-p', 'Zoek een partij of persoon') +
    '<select class="select" data-filter="pfocus" aria-label="Focus"><option value="">Alle focus</option>' + FOCUS.map(function (f) { return '<option' + (f === F.pfocus ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select>' +
    '<select class="select" data-filter="pmarket" aria-label="Markt"><option value="">Alle markten</option>' + markets.map(function (m) { return '<option' + (norm(m) === norm(F.pmarket) ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>' +
    '<select class="select" data-filter="pstage" aria-label="Status"><option value="">Alle statussen</option>' + STAGES.map(function (st) { return '<option value="' + st.key + '"' + (st.key === F.pstage ? ' selected' : '') + '>' + esc(st.title) + '</option>'; }).join('') + '<option value="geen"' + (F.pstage === 'geen' ? ' selected' : '') + '>Niet in de pipeline</option></select>' +
    '<select class="select" data-filter="pknown" aria-label="Wie ken ik"><option value="">Met en zonder contacten</option><option value="ja"' + (F.pknown === 'ja' ? ' selected' : '') + '>Met contacten</option><option value="nee"' + (F.pknown === 'nee' ? ' selected' : '') + '>Nog niemand</option></select>' +
    clearFilters(['pfocus', 'pmarket', 'pstage', 'pknown']) +
    sortSelect('partijen', [['partij', 'naam'], ['type', 'type'], ['status', 'status'], ['wie', 'aantal contacten'], ['last', 'laatst gesproken']]) +
    '<span class="filterbar__count">' + plural(list.length, 'partij', 'partijen') + '</span></div>';
  var body = list.length ? '<div class="table-container"><table class="table table--sortable"><colgroup><col class="c-party"><col class="c-type hide-m"><col class="c-status hide-m"><col class="c-focus hide-m"><col class="hide-m"><col><col class="c-date hide-m"></colgroup><thead><tr>' + sortTh('partijen', 'partij', 'Partij') + sortTh('partijen', 'type', 'Type', 'hide-m') + sortTh('partijen', 'status', 'Status', 'hide-m') + sortTh('partijen', 'focus', 'Focus', 'hide-m') + sortTh('partijen', 'markten', 'Markten', 'hide-m') + sortTh('partijen', 'wie', 'Wie ken ik') + sortTh('partijen', 'last', 'Laatst gesproken', 'hide-m') + '</tr></thead><tbody>' +
    list.map(function (p) {
      var cs = (IX.byParty[p.id] || []).slice().sort(function (a, b) { return cmpName(fullName(a), fullName(b)); }), t = typeOfParty(p);
      var last = cs.map(lastContact).filter(Boolean).sort(function (a, b) { return b - a; })[0];
      return '<tr class="table__row--link" data-href="#partij/' + esc(p.id) + '"><td title="' + esc([p.name, p.city].filter(Boolean).join(', ')) + '">' + partyCell(p, 'only-m-inline') + '</td><td class="hide-m">' + (t ? '<span class="type-cell">' + typeDot(t) + esc(t.name) + '</span>' : '') + '</td><td class="hide-m">' + (inPipeline(p) ? stageLabel(p) : '<span class="muted">—</span>') + '</td><td class="hide-m">' + esc(focusText(p)) + '</td><td class="hide-m" title="' + esc(arr(p.markets).join(', ')) + '">' + arr(p.markets).map(function (m) { return '<span class="tag tag--small">' + esc(m) + '</span>'; }).join('') + '</td>' +
        '<td title="' + esc(cs.map(fullName).join(', ')) + '">' + (cs.length ? esc(cs.map(fullName).join(', ')) : '<span class="muted">Nog niemand</span>') + '</td><td class="hide-m">' + (last ? esc(fmtDate(last)) : '<span class="muted">—</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : '<div class="base-container">' + emptyState(S.parties.length ? 'Geen partijen gevonden' : 'Nog geen partijen', S.parties.length ? 'Kies een ander type of pas de filters of zoekterm aan.' : 'Voeg een partij toe, of maak er een aan vanuit een contact.', '<button class="btn btn--success" type="button" data-href="#partij/nieuw' + (ft ? '/' + esc(ft) : '') + '">' + icon('plus', 'icon--14') + '<span class="btn__text">Partij toevoegen</span></button>') + '</div>';
  return '<section class="container container--wide">' + actionbar('Partijen', '<button class="btn btn--success" type="button" data-href="#partij/nieuw' + (ft ? '/' + esc(ft) : '') + '">' + icon('plus', 'icon--14') + '<span class="btn__text">Partij toevoegen</span></button>') +
    (S.needsMigration ? migrationAlert() + '<div class="filterbar only-m">' + searchField('q-p', 'Zoek een partij of persoon') + '</div>' : '') + tabs + pfilters + body + '</section>';
}

/* ---------- FOCUS EN MARKTEN ---------- */
function arr(v) { return Array.isArray(v) ? v : []; }
function allMarkets() { var m = {}; S.parties.forEach(function (p) { arr(p.markets).forEach(function (x) { m[norm(x)] = m[norm(x)] || x; }); }); return Object.keys(m).map(function (k) { return m[k]; }).sort(cmpName); }
function focusChips(id, sel) {
  return '<div class="chips" id="' + id + '" role="group" aria-label="Focus">' + FOCUS.map(function (f) { var on = arr(sel).indexOf(f) >= 0; return '<button type="button" class="chip' + (on ? ' chip--on' : '') + '" aria-pressed="' + on + '" data-chip="' + esc(f) + '">' + (on ? icon('check', 'icon--12') : '') + esc(f) + '</button>'; }).join('') + '</div>';
}
function marketTags(id, vals) {
  return '<div class="tags" id="' + id + '">' + arr(vals).map(function (m) { return tagHtml(m); }).join('') +
    '<span class="tags__add"><input class="text-field__input" type="text" list="' + id + '-list" placeholder="Markt toevoegen" data-tag-input aria-label="Markt toevoegen"><button class="btn btn--icon-only compact" type="button" data-tag-add aria-label="Markt toevoegen" title="Toevoegen">' + icon('plus', 'icon--14') + '</button></span>' +
    '<datalist id="' + id + '-list">' + allMarkets().map(function (m) { return '<option value="' + esc(m) + '">'; }).join('') + '</datalist></div>';
}
function tagHtml(m) { return '<span class="tag" data-tag="' + esc(m) + '">' + esc(m) + '<button type="button" class="tag__x" data-tag-remove aria-label="' + esc(m) + ' verwijderen">×</button></span>'; }
function readChips(id) { var el = $('#' + id); return el ? $all('.chip--on', el).map(function (c) { return c.dataset.chip; }) : []; }
function readTags(id) {
  var el = $('#' + id); if (!el) return [];
  var out = $all('[data-tag]', el).map(function (t) { return t.dataset.tag; });
  var inp = $('[data-tag-input]', el); if (inp && inp.value.trim() && !out.some(function (x) { return norm(x) === norm(inp.value.trim()); })) out.push(inp.value.trim());
  return out;
}
function addTag(box) {
  var inp = $('[data-tag-input]', box), v = inp.value.trim(); if (!v) { inp.focus(); return; }
  var exist = allMarkets().find(function (m) { return norm(m) === norm(v); }); if (exist) v = exist;
  if (!$all('[data-tag]', box).some(function (t) { return norm(t.dataset.tag) === norm(v); })) inp.parentNode.insertAdjacentHTML('beforebegin', tagHtml(v));
  inp.value = ''; inp.focus(); dirty = true; autosaveSoon(300);
}
function sortedFocus(p) { return arr(p.focus).slice().sort(function (a, b) { return FOCUS.indexOf(a) - FOCUS.indexOf(b); }); }
function focusText(p) { return sortedFocus(p).join(', '); }

/* ---------- SALES PIPELINE ---------- */
function inPipeline(p) { return !!p.pipeline_stage && !!STAGE[p.pipeline_stage]; }
function pipelineDue() { var t = todayIso(); return S.parties.filter(function (p) { return inPipeline(p) && !STAGE[p.pipeline_stage].closed && p.pipeline_next_date && p.pipeline_next_date <= t; }).length; }
function stageLabel(p) { return inPipeline(p) ? '<span class="stage-label stage-label--' + esc(p.pipeline_stage) + '">' + esc(STAGE[p.pipeline_stage].title) + '</span>' : ''; }
function nextStepHtml(p) {
  if (!p.pipeline_next_step && !p.pipeline_next_date) return '';
  var d = parseDate(p.pipeline_next_date), cls = '';
  if (d) { var n = daysBetween(today(), d); cls = n < 0 ? ' pcard__next--late' : n <= 7 ? ' pcard__next--soon' : ''; }
  return '<div class="pcard__next' + cls + '">' + icon('clock', 'icon--12') + '<span>' + esc(p.pipeline_next_step || 'Volgende stap') + (d ? ' · ' + esc(fmtRel(d)) : '') + '</span></div>';
}
function migrationAlert() {
  return '<div class="alert alert--warning mb16">' + icon('alert', 'alert__icon') + '<div class="alert__body">De database mist nog de pipelinekolommen.<div class="muted" style="font-weight:400;margin-top:4px">Voer in Supabase (SQL Editor) het bestand crm-migratie-1-pipeline.sql uit en ververs deze pagina.</div></div></div>';
}
function vPipeline() {
  var list = S.parties.filter(function (p) { return inPipeline(p) && matchQParty(p); });
  var stages = STAGES.filter(function (st) { return S.showClosed || !st.closed; });
  var closedN = S.parties.filter(function (p) { return inPipeline(p) && STAGE[p.pipeline_stage].closed; }).length;
  var cols = stages.map(function (st) {
    var cards = list.filter(function (p) { return p.pipeline_stage === st.key; }).sort(function (a, b) {
      var ad = a.pipeline_next_date || '9999', bd = b.pipeline_next_date || '9999'; return ad < bd ? -1 : ad > bd ? 1 : cmpName(a.name, b.name);
    });
    return '<div class="pcol" data-stage="' + st.key + '"><div class="pcol__head"><span class="pcol__title"><span class="sdot sdot--' + st.key + '" aria-hidden="true"></span>' + esc(st.title) + '</span><span class="pcol__count">' + cards.length + '</span></div><div class="pcol__body" data-drop="' + st.key + '">' +
      cards.map(function (p) {
        var t = typeOfParty(p), cs = (IX.byParty[p.id] || []).slice().sort(function (a, b) { return cmpName(fullName(a), fullName(b)); });
        return '<div class="pcard" draggable="true" data-pid="' + esc(p.id) + '" data-href="#partij/' + esc(p.id) + '" tabindex="0">' +
          '<div class="pcard__top"><span class="pcard__name">' + esc(p.name) + '</span>' +
          '<div class="drpdwn"><button class="btn btn--icon-only compact pcard__menu" type="button" aria-haspopup="menu" aria-expanded="false" data-drpdwn aria-label="Fase wijzigen" title="Fase wijzigen">' + icon('chevron-down', 'icon--14') + '</button>' +
          '<div class="drpdwn__menu drpdwn__menu--right" role="menu">' + STAGES.map(function (s2) { return '<button class="drpdwn__item" role="menuitem" data-act="stage" data-id="' + esc(p.id) + '" data-stage="' + s2.key + '"' + (s2.key === p.pipeline_stage ? ' disabled' : '') + '>' + (s2.key === p.pipeline_stage ? icon('check') : '<span style="width:14px"></span>') + esc(s2.title) + '</button>'; }).join('') +
          '<hr class="drpdwn__divider"><button class="drpdwn__item drpdwn__item--danger" role="menuitem" data-act="stage" data-id="' + esc(p.id) + '" data-stage="">' + icon('circle-minus') + 'Uit de pipeline halen</button></div></div></div>' +
          '<div class="pcard__meta">' + (t ? typeDot(t) : '') + '<span>' + esc([t && t.name, p.city].filter(Boolean).join(' · ')) + '</span></div>' +
          (arr(p.focus).length || arr(p.markets).length ? '<div class="pcard__tags">' + sortedFocus(p).map(function (x) { return '<span class="tag tag--small tag--focus">' + esc(x) + '</span>'; }).join('') + arr(p.markets).map(function (m) { return '<span class="tag tag--small">' + esc(m) + '</span>'; }).join('') + '</div>' : '') +
          (cs.length ? '<div class="pcard__people">' + icon('user', 'icon--12') + '<span>' + esc(cs.map(fullName).join(', ')) + '</span></div>' : '') +
          nextStepHtml(p) + '</div>';
      }).join('') + (st.key === 'te_benaderen' ? '<button class="pcol__add" type="button" data-act="new-lead">' + icon('plus', 'icon--14') + 'Nieuwe partij</button>' : '') + '</div></div>';
  }).join('');
  var total = list.filter(function (p) { return !STAGE[p.pipeline_stage].closed; }).length;
  return '<section class="container container--wide">' + actionbar('Sales pipeline', '<button class="btn btn--success" type="button" data-act="new-lead">' + icon('plus', 'icon--14') + '<span class="btn__text">Nieuwe partij</span></button>') +
    (S.needsMigration ? migrationAlert() : '') +
    '<div class="filterbar">' + searchField('q-pl', 'Zoek in de pipeline') + '<span class="muted">' + plural(total, 'lopende partij', 'lopende partijen') + '</span>' +
    '<label class="checkbox filterbar__count"><input type="checkbox" data-act-change="show-closed"' + (S.showClosed ? ' checked' : '') + '>Gewonnen en afgevallen tonen' + (closedN ? ' (' + closedN + ')' : '') + '</label></div>' +
    '<div class="pboard">' + cols + '</div>' +
    '<p class="form-input__hint mt16 hide-m">Sleep een kaart naar een andere fase, of kies de fase via de pijl op de kaart. Een partij in de pipeline staat ook gewoon bij Partijen en haar mensen bij Contacten.</p></section>';
}
async function actStage(pid, stage) {
  var p = IX.party[pid]; if (!p || (p.pipeline_stage || '') === stage) return;
  if (S.needsMigration) { toast('Voer eerst de migratie voor de pipeline uit.', 'danger'); return; }
  var patch = { pipeline_stage: stage || null };
  if (stage && !p.pipeline_since) patch.pipeline_since = todayIso();
  try { Object.assign(p, await Store.update('parties', pid, patch)); index(); render(); toast(stage ? p.name + ' → ' + STAGE[stage].title : p.name + ' uit de pipeline gehaald.'); } catch (e) { fail(e); }
}
async function actNewLead() {
  if (S.needsMigration) { toast('Voer eerst de migratie voor de pipeline uit.', 'danger'); return; }
  var body = '<div class="fieldset__header">' + icon('building') + 'Partij</div>' +
    fieldRow('Naam', 'l-name', '<span class="text-field text-field--full" style="width:100%"><input class="text-field__input" id="l-name" type="text" list="l-parties" data-autofocus autocomplete="off" placeholder="Nieuwe of bestaande partij"></span><datalist id="l-parties">' + S.parties.filter(function (p) { return !inPipeline(p); }).map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>') +
    fieldRow('Type', 'l-type', '<select class="select" id="l-type">' + typeOptions('', 'Geen type') + '</select>') +
    fieldRow('Plaats', 'l-city', textInput('l-city', '', { cls: 'text-field--wide' })) +
    fieldRow('Focus', 'l-focus', focusChips('l-focus', [])) +
    fieldRow('Markten', 'l-markets', marketTags('l-markets', []), true) +
    fieldRow('Fase', 'l-stage', '<select class="select" id="l-stage">' + STAGES.filter(function (st) { return !st.closed; }).map(function (st) { return '<option value="' + st.key + '">' + esc(st.title) + '</option>'; }).join('') + '</select>') +
    fieldRow('Volgende stap', 'l-step', textInput('l-step', '', { cls: 'text-field--full', ph: 'Bijv. mail sturen, bellen' })) +
    fieldRow('Wanneer', 'l-date', textInput('l-date', '', { type: 'date' })) +
    '<div class="fieldset__header mt16">' + icon('user') + 'Contactpersoon <span class="muted" style="font-weight:400">· optioneel</span></div>' +
    fieldRow('Voornaam', 'l-first', textInput('l-first', '', { cls: 'text-field--wide' })) +
    fieldRow('Achternaam', 'l-last', textInput('l-last', '', { cls: 'text-field--wide' })) +
    fieldRow('Functie', 'l-role', textInput('l-role', '', { cls: 'text-field--wide' })) +
    fieldRow('E-mail', 'l-email', textInput('l-email', '', { type: 'email', cls: 'text-field--full' })) +
    fieldRow('Telefoon', 'l-phone', textInput('l-phone', '', { type: 'tel', cls: 'text-field--wide' }));
  var r = await openPopup({ title: 'Nieuwe partij in de pipeline', body: body,
    buttons: [{ label: 'Toevoegen', cls: 'btn--primary', validate: function () { var ok = !!$('#l-name').value.trim(); $('#l-name').parentNode.classList.toggle('text-field--error', !ok); if (!ok) $('#l-name').focus(); return ok; } }, { label: 'Annuleren', value: false }],
    collect: function () { var o = {}; ['name', 'type', 'city', 'stage', 'step', 'date', 'first', 'last', 'role', 'email', 'phone'].forEach(function (k) { o[k] = $('#l-' + k).value.trim(); }); o.focus = readChips('l-focus'); o.markets = readTags('l-markets'); return o; } });
  if (!r || !r.data) return;
  var v = r.data;
  try {
    var p = S.parties.find(function (x) { return norm(x.name) === norm(v.name); });
    var pipe = { pipeline_stage: v.stage, pipeline_next_step: v.step || null, pipeline_next_date: v.date || null, pipeline_since: todayIso() };
    if (p) {
      var mk = arr(p.markets).slice(); v.markets.forEach(function (m) { if (!mk.some(function (x) { return norm(x) === norm(m); })) mk.push(m); });
      var fc = arr(p.focus).slice(); v.focus.forEach(function (f) { if (fc.indexOf(f) < 0) fc.push(f); });
      Object.assign(p, await Store.update('parties', p.id, Object.assign(pipe, { focus: fc, markets: mk }, v.type && !p.type_id ? { type_id: v.type } : {}, v.city && !p.city ? { city: v.city } : {})));
    }
    else { p = await Store.insert('parties', Object.assign({ name: v.name, type_id: v.type || null, city: v.city || null, focus: v.focus, markets: v.markets }, pipe)); S.parties.push(p); }
    if (v.last || v.first) {
      var c = await Store.insert('contacts', { first_name: v.first || null, last_name: v.last || v.first, role: v.role || null, party_id: p.id, email: v.email || null, phone: v.phone || null, recurring: false, interval_months: +S.settings.default_interval_months || 3 });
      if (!v.last) c.first_name = null;
      S.contacts.push(c);
    }
    index(); render(); toast(p.name + ' staat in de pipeline.');
  } catch (e) { fail(e); }
}

/* ---------- CONTACT (detail en nieuw) ---------- */
function fieldRow(label, id, inner, top) { return '<div class="form-input' + (top ? ' form-input--top' : '') + '"><label class="form-input__label" for="' + id + '">' + esc(label) + '</label><div class="form-input__field">' + inner + '</div></div>'; }
function textInput(id, val, opts) {
  opts = opts || {};
  return '<span class="text-field' + (opts.cls ? ' ' + opts.cls : '') + '"><input class="text-field__input" id="' + id + '" name="' + id + '" type="' + (opts.type || 'text') + '" value="' + esc(val || '') + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.req ? ' required' : '') + (opts.af ? ' data-autofocus' : '') + ' autocomplete="off"></span>';
}
function vContact() {
  var isNew = route.id === 'nieuw';
  var c = isNew ? { first_name: '', last_name: '', role: '', email: '', phone: '', linkedin: '', notes: '', party_id: route.extra && IX.party[route.extra] ? route.extra : '', recurring: true, interval_months: S.settings.default_interval_months || 3, snooze_until: null } : IX.contact[route.id];
  if (!c) return '<section class="container">' + actionbar('Contact niet gevonden') + '<div class="base-container">' + emptyState('Dit contact bestaat niet (meer)', 'Misschien is het verwijderd.', '<button class="btn" type="button" data-href="#contacten">Naar contacten</button>') + '</div></section>';
  var intervals = INTERVALS.slice(); if (intervals.indexOf(+c.interval_months) < 0) intervals.push(+c.interval_months); intervals.sort(function (a, b) { return a - b; });
  var form = '<form class="base-container base-container--padding" id="f-contact" autocomplete="off" novalidate>' +
    '<fieldset class="fieldset"><div class="fieldset__header">' + icon('user') + 'Persoon</div>' +
    fieldRow('Voornaam', 'first_name', textInput('first_name', c.first_name, { cls: 'text-field--wide', af: isNew })) +
    fieldRow('Achternaam', 'last_name', textInput('last_name', c.last_name, { cls: 'text-field--wide', req: true })) +
    fieldRow('Functie', 'role', textInput('role', c.role, { cls: 'text-field--wide' })) +
    fieldRow('Partij', 'party_id', '<select class="select" id="party_id" name="party_id">' + partyOptions(c.party_id, 'Geen partij') + '<option value="__new">+ Nieuwe partij…</option></select>') +
    '</fieldset>' +
    '<fieldset class="fieldset"><div class="fieldset__header">' + icon('inbox') + 'Gegevens</div>' +
    fieldRow('E-mail', 'email', textInput('email', c.email, { type: 'email', cls: 'text-field--full' })) +
    fieldRow('Telefoon', 'phone', textInput('phone', c.phone, { type: 'tel', cls: 'text-field--wide' })) +
    fieldRow('LinkedIn', 'linkedin', textInput('linkedin', c.linkedin, { type: 'url', cls: 'text-field--full', ph: 'https://www.linkedin.com/in/…' })) +
    fieldRow('Notitie', 'notes', '<textarea class="textarea" id="notes" name="notes">' + esc(c.notes || '') + '</textarea>', true) +
    '</fieldset>' +
    '<fieldset class="fieldset" style="margin-bottom:0"><div class="fieldset__header">' + icon('clock') + 'Opvolging</div>' +
    fieldRow('Herhaaldelijk spreken', 'recurring', '<span class="switch-row"><button class="switch" type="button" role="switch" id="recurring" aria-checked="' + (c.recurring ? 'true' : 'false') + '" aria-label="Herhaaldelijk spreken"><span class="switch__knob"></span></button><span class="switch-row__hint" id="recurring-hint">' + (c.recurring ? 'Staat op de actielijst' : 'Staat niet op de actielijst') + '</span></span>') +
    '<div id="rec-fields"' + (c.recurring ? '' : ' class="hidden"') + '>' +
    fieldRow('Elke', 'interval_months', '<select class="select" id="interval_months" name="interval_months" style="width:160px">' + intervals.map(function (n) { return '<option value="' + n + '"' + (n === +c.interval_months ? ' selected' : '') + '>' + plural(n, 'maand', 'maanden') + '</option>'; }).join('') + '</select>') +
    (isNew ? fieldRow('Laatst gesproken', 'last_spoken', textInput('last_spoken', '', { type: 'date' }) + '<span class="muted">optioneel</span>') : '') +
    fieldRow('Uitgesteld tot', 'snooze_until', textInput('snooze_until', c.snooze_until || '', { type: 'date' }) + '<span class="muted">optioneel</span>') +
    '</div></fieldset></form>';
  var side = '';
  if (!isNew) {
    var xs = IX.byContact[c.id] || [], due = nextDue(c), last = lastContact(c), p = partyOf(c);
    side = '<div class="detail__side"><div class="base-container side-block"><div class="side-block__title">Opvolging</div><dl class="kv">' +
      '<dt>Laatst gesproken</dt><dd>' + (last ? esc(fmtDate(last, true)) : '—') + '</dd>' +
      '<dt>Volgende keer</dt><dd>' + (c.recurring ? (due ? esc(fmtDate(due, true)) : 'nu') : 'niet gepland') + '</dd>' +
      (p ? '<dt>Partij</dt><dd><a href="#partij/' + esc(p.id) + '">' + esc(p.name) + '</a></dd>' : '') +
      '</dl><div class="form-actions-inline">' + (c.recurring ? snoozeMenu(c) : '') + spokenBtn(c) + '</div></div>' +
      '<div class="base-container side-block" style="padding-bottom:4px"><div class="side-block__title">Contactmomenten <button class="btn btn--icon-only compact" type="button" data-act="add-interaction" data-id="' + esc(c.id) + '" aria-label="Contactmoment toevoegen" title="Contactmoment toevoegen">' + icon('plus', 'icon--14') + '</button></div>' +
      (xs.length ? '<div class="feed-list" style="margin:0 -16px">' + xs.map(function (x) {
        return '<div class="feed-entry feed-entry--compact feed-entry--note"><span class="feed-entry__avatar">' + icon(kindIcon(x.kind)) + '</span><span class="feed-entry__title">' + esc(x.kind) + ' · ' + esc(fmtDate(x.date, true)) + '</span>' +
          '<span class="feed-entry__side"><button class="btn btn--icon-only compact" type="button" data-act="edit-interaction" data-id="' + esc(x.id) + '" aria-label="Bewerken">' + icon('pencil', 'icon--14') + '</button></span>' +
          (x.notes ? '<span class="feed-entry__notes">' + esc(x.notes) + '</span>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="muted" style="padding-bottom:12px">Nog geen contactmomenten.</p>') + '</div></div>';
  }
  if (isNew) return '<section class="container">' + crumbBack() + actionbar('Contact toevoegen') +
    '<div class="detail detail--single"><div>' + form + addBar('save-contact', true) + '</div></div></section>';
  var actions = mailBtn(c) + '<button class="btn" type="button" data-act="delete-contact" data-id="' + esc(c.id) + '">' + icon('trash', 'icon--14') + '<span class="btn__text">Verwijderen</span></button>';
  return '<section class="container">' + contactHead(c, actions) + '<div class="detail"><div>' + form + '</div>' + side + '</div></section>';
}

/* ---------- PARTIJ (detail en nieuw) ---------- */
function vPartij() {
  var isNew = route.id === 'nieuw';
  var p = isNew ? { name: '', type_id: route.extra && IX.type[route.extra] ? route.extra : (S.types[0] ? S.types[0].id : ''), city: '', website: '', notes: '', focus: [], markets: [], pipeline_stage: null } : IX.party[route.id];
  if (!p) return '<section class="container">' + actionbar('Partij niet gevonden') + '<div class="base-container">' + emptyState('Deze partij bestaat niet (meer)', 'Misschien is ze verwijderd.', '<button class="btn" type="button" data-href="#partijen">Naar partijen</button>') + '</div></section>';
  var form = '<form class="base-container base-container--padding" id="f-party" autocomplete="off" novalidate><fieldset class="fieldset" style="margin-bottom:0"><div class="fieldset__header">' + icon('building') + 'Partij</div>' +
    fieldRow('Naam', 'name', textInput('name', p.name, { cls: 'text-field--full', req: true, af: isNew })) +
    fieldRow('Type', 'type_id', '<select class="select" id="type_id" name="type_id">' + typeOptions(p.type_id, 'Geen type') + '</select>') +
    fieldRow('Plaats', 'city', textInput('city', p.city, { cls: 'text-field--wide' })) +
    (S.needsMigration ? '' : fieldRow('Focus', 'focus', focusChips('focus', p.focus)) + fieldRow('Markten', 'markets', marketTags('markets', p.markets), true)) +
    fieldRow('Website', 'website', textInput('website', p.website, { type: 'url', cls: 'text-field--full', ph: 'https://' })) +
    fieldRow('Notitie', 'notes', '<textarea class="textarea" id="notes" name="notes">' + esc(p.notes || '') + '</textarea>', true) +
    '</fieldset>' + (S.needsMigration ? '' : '<fieldset class="fieldset mt16" style="margin-bottom:0"><div class="fieldset__header">' + icon('chart') + 'Sales pipeline</div>' +
    fieldRow('Fase', 'pipeline_stage', '<select class="select" id="pipeline_stage" name="pipeline_stage"><option value="">Niet in de pipeline</option>' + STAGES.map(function (st) { return '<option value="' + st.key + '"' + (st.key === p.pipeline_stage ? ' selected' : '') + '>' + esc(st.title) + '</option>'; }).join('') + '</select>') +
    fieldRow('Volgende stap', 'pipeline_next_step', textInput('pipeline_next_step', p.pipeline_next_step, { cls: 'text-field--full', ph: 'Bijv. mail sturen, bellen' })) +
    fieldRow('Wanneer', 'pipeline_next_date', textInput('pipeline_next_date', p.pipeline_next_date || '', { type: 'date' })) +
    (p.pipeline_since && inPipeline(p) ? '<p class="form-input__hint" style="margin-left:170px">In de pipeline sinds ' + esc(fmtDate(p.pipeline_since, true)) + '.</p>' : '') +
    '</fieldset>') + '</form>';
  var side = '';
  if (!isNew) {
    var cs = (IX.byParty[p.id] || []).slice().sort(function (a, b) { return cmpName(fullName(a), fullName(b)); });
    side = '<div class="detail__side">' + (S.needsMigration ? '' : pipelineBlock(p)) + '<div class="base-container side-block" style="padding-bottom:4px"><div class="side-block__title">Wie ken ik hier <button class="btn btn--icon-only compact" type="button" data-href="#contact/nieuw/' + esc(p.id) + '" aria-label="Contact toevoegen bij deze partij" title="Contact toevoegen">' + icon('plus', 'icon--14') + '</button></div>' +
      (cs.length ? '<div class="feed-list" style="margin:0 -16px">' + cs.map(function (c) {
        return '<div class="feed-entry feed-entry--compact feed-entry--link" data-href="#contact/' + esc(c.id) + '"><span class="feed-entry__avatar tone-' + contactTone(c) + '">' + esc(initials(fullName(c))) + '</span><span class="feed-entry__title">' + esc(fullName(c)) + '</span><span class="feed-entry__subtitle"><span>' + esc(c.role || '') + '</span></span><span class="feed-entry__side">' + dueLabel(c) + '</span></div>';
      }).join('') + '</div>' : '<p class="muted" style="padding-bottom:12px">Nog niemand vastgelegd.</p>') + '</div>' + timelineBlock(cs) + '</div>';
  }
  if (isNew) return '<section class="container">' + crumbBack() + actionbar('Partij toevoegen') +
    '<div class="detail detail--single"><div>' + form + addBar('save-party', false) + '</div></div></section>';
  var actions = '<button class="btn" type="button" data-act="delete-party" data-id="' + esc(p.id) + '">' + icon('trash', 'icon--14') + '<span class="btn__text">Verwijderen</span></button>';
  return '<section class="container">' + partyHead(p, actions) + '<div class="detail"><div>' + form + '</div>' + side + '</div></section>';
}

function partyHead(p, actions) {
  var t = typeOfParty(p), n = (IX.byParty[p.id] || []).length, back = lastList === 'pipeline' ? ['pipeline', 'Sales pipeline'] : ['partijen', 'Partijen'];
  var site = p.website ? '<a href="' + esc(/^https?:\/\//i.test(p.website) ? p.website : 'https://' + p.website) + '" target="_blank" rel="noopener">' + esc(String(p.website).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')) + '</a>' : '';
  return '<div class="crumbbar"><a class="crumb" href="#' + back[0] + '">' + icon('chevron-left', 'icon--12') + esc(back[1]) + '</a>' + saveState() + '</div>' +
    '<div class="base-container phead" id="dhead"><span class="avatar avatar--lg tone-' + typeTone(t) + '">' + esc(initials(p.name)) + '</span>' +
    '<div class="phead__main"><div class="phead__title"><h1>' + esc(p.name) + '</h1>' + (t ? '<span class="type-chip tone-' + typeTone(t) + '">' + typeDot(t) + esc(t.name) + '</span>' : '') + stageLabel(p) + '</div>' +
    '<div class="phead__meta">' + [p.city ? esc(p.city) : '', site, plural(n, 'contact', 'contacten')].filter(Boolean).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
    (S.needsMigration ? '' : '<div class="phead__row"><span class="phead__lbl">Focus</span>' + FOCUS.map(function (x) { return '<span class="fchip' + (arr(p.focus).indexOf(x) >= 0 ? ' fchip--on' : '') + '">' + esc(x) + '</span>'; }).join('') + '</div>' +
    '<div class="phead__row"><span class="phead__lbl">Markten</span>' + (arr(p.markets).length ? arr(p.markets).map(function (m) { return '<span class="tag">' + esc(m) + '</span>'; }).join('') : '<span class="muted">Nog geen markten. Voeg ze hieronder toe.</span>') + '</div>') +
    '</div><div class="phead__actions">' + actions + '<button class="btn btn--success" type="button" data-href="#contact/nieuw/' + esc(p.id) + '">' + icon('plus', 'icon--14') + '<span class="btn__text">Contact</span></button></div></div>';
}
function contactHead(c, actions) {
  var p = partyOf(c), t = typeOfParty(p), last = lastContact(c);
  var meta = [];
  if (c.email) meta.push('<a href="' + esc(mailUrl(c)) + '">' + esc(c.email) + '</a>');
  if (c.phone) meta.push('<a href="tel:' + esc(String(c.phone).replace(/[^+\d]/g, '')) + '">' + esc(c.phone) + '</a>');
  if (c.linkedin) meta.push('<a href="' + esc(/^https?:\/\//i.test(c.linkedin) ? c.linkedin : 'https://' + c.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>');
  meta.push(last ? 'Laatst gesproken ' + esc(fmtDate(last)) : 'Nog niet gesproken');
  return '<div class="crumbbar"><a class="crumb" href="#contacten">' + icon('chevron-left', 'icon--12') + 'Contacten</a>' + saveState() + '</div>' +
    '<div class="base-container phead" id="dhead"><span class="avatar avatar--lg tone-' + contactTone(c) + '">' + esc(initials(fullName(c))) + '</span>' +
    '<div class="phead__main"><div class="phead__title"><h1>' + esc(fullName(c)) + '</h1>' + (c.recurring ? '<span class="recurring-mark">' + icon('clock', 'icon--12') + 'elke ' + esc(c.interval_months) + ' mnd</span>' : '') + '</div>' +
    '<div class="phead__sub">' + (c.role ? esc(c.role) : '') + (p ? (c.role ? '<span class="phead__dot" aria-hidden="true">·</span>' : '') + '<a href="#partij/' + esc(p.id) + '">' + typeDot(t) + esc(p.name) + '</a>' : '') + '</div>' +
    '<div class="phead__meta">' + meta.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
    '</div><div class="phead__actions">' + actions + '</div></div>';
}
function saveState() { return '<span class="savestate savestate--saved" id="savestate" role="status" aria-live="polite">' + icon('check-circle', 'icon--14') + '<span>Wijzigingen worden automatisch opgeslagen</span></span>'; }
function setSaveState(st, msg) {
  var el = $('#savestate'); if (!el) return;
  var m = { pending: ['clock', 'Wijzigingen…'], saving: ['clock', 'Opslaan…'], saved: ['check-circle', 'Opgeslagen'], error: ['alert', msg || 'Niet opgeslagen'] }[st];
  el.className = 'savestate savestate--' + st; el.innerHTML = icon(m[0], 'icon--14') + '<span>' + esc(m[1]) + '</span>';
}
function crumbBack() {
  var h = backHash(), label = { contacten: 'Contacten', partijen: 'Partijen', pipeline: 'Sales pipeline', actielijst: 'Actielijst', instellingen: 'Instellingen' }[h.split('/')[0]] || 'Terug';
  if (/^partij\//.test(h) && IX.party[h.split('/')[1]]) label = IX.party[h.split('/')[1]].name;
  if (/^contact\//.test(h) && IX.contact[h.split('/')[1]]) label = fullName(IX.contact[h.split('/')[1]]);
  return '<div class="crumbbar"><a class="crumb" href="#' + esc(h) + '">' + icon('chevron-left', 'icon--12') + esc(label) + '</a></div>';
}
function addBar(act, again) {
  return '<div class="actionbar-bottom"><button class="btn btn--primary" type="button" data-act="' + act + '">' + icon('check', 'icon--14') + '<span class="btn__text">Toevoegen</span></button>' +
    (again ? '<button class="btn" type="button" data-act="' + act + '" data-again="1">' + icon('plus', 'icon--14') + '<span class="btn__text">Toevoegen en nog een</span></button>' : '') +
    '<button class="btn btn--plain" type="button" data-act="back"><span class="btn__text">Annuleren</span></button></div>';
}
/* waar 'terug' heen gaat na toevoegen of annuleren: de pagina waar je vandaan kwam */
var prevHash = '';
function backHash() {
  var h = prevHash.replace(/^#/, '');
  if (!h || /\/nieuw/.test(h)) h = route.view === 'partij' ? (lastList || 'partijen') : 'contacten';
  return h;
}

/* ---------- AUTOMATISCH OPSLAAN ---------- */
var Auto = { timer: null, busy: false, queued: null, needRefresh: false };
function onEditPage() { return (route.view === 'contact' || route.view === 'partij') && route.id && route.id !== 'nieuw' && !!($('#f-contact') || $('#f-party')); }
function autosaveSoon(delay) {
  if (!onEditPage()) return;
  dirty = true; setSaveState('pending');
  clearTimeout(Auto.timer); Auto.timer = setTimeout(autosaveNow, delay == null ? 700 : delay);
}
/* leest het formulier direct (ook vlak voor het wisselen van pagina) en slaat daarna op */
function autosaveNow() {
  clearTimeout(Auto.timer); Auto.timer = null;
  var job = $('#f-contact') ? contactJob(route.id) : $('#f-party') ? partyJob(route.id) : null;
  if (!job) return;
  if (job.error) { setSaveState('error', job.error); return; }
  if (Auto.busy) { Auto.queued = job; return; }
  runJob(job);
}
async function runJob(job) {
  Auto.busy = true; setSaveState('saving');
  try {
    var saved = await Store.update(job.table, job.id, job.row);
    Object.assign(job.table === 'contacts' ? IX.contact[job.id] : IX.party[job.id], saved || job.row); index();
    if (!Auto.queued && !Auto.timer) { dirty = false; if (route.id === job.id) { refreshDetail(); setSaveState('saved'); } }
  } catch (e) { setSaveState('error', 'Opslaan mislukt'); fail(e); }
  Auto.busy = false;
  if (Auto.queued) { var q = Auto.queued; Auto.queued = null; runJob(q); }
}
/* zijkolom en kop bijwerken zonder het formulier (en de cursor) te verstoren */
/* niet vervangen terwijl de muis is ingedrukt: anders gaat de klik op een knop of link verloren */
var pointerIsDown = false;
document.addEventListener('pointerdown', function () { pointerIsDown = true; }, true);
document.addEventListener('pointerup', function () { pointerIsDown = false; if (Auto.needRefresh) setTimeout(refreshDetail, 0); }, true);
function refreshDetail() {
  if (!onEditPage()) return;
  if (pointerIsDown) { Auto.needRefresh = true; return; }
  Auto.needRefresh = false;
  var html = route.view === 'contact' ? vContact() : vPartij(), tmp = document.createElement('div'); tmp.innerHTML = html;
  ['#dhead', '.detail__side'].forEach(function (sel) { var a = $(sel), b = $(sel, tmp); if (a && b && a.innerHTML !== b.innerHTML) a.replaceWith(b); });
}
function contactJob(id) {
  var v = readForm($('#f-contact')), rec = $('#recurring').getAttribute('aria-checked') === 'true';
  if (!v.last_name) { $('#last_name').parentNode.classList.add('text-field--error'); return { error: 'Niet opgeslagen: vul een achternaam in' }; }
  return { table: 'contacts', id: id, row: { first_name: v.first_name || null, last_name: v.last_name, role: v.role || null, party_id: v.party_id && v.party_id !== '__new' ? v.party_id : null,
    email: v.email || null, phone: v.phone || null, linkedin: v.linkedin || null, notes: v.notes || null, recurring: rec, interval_months: +v.interval_months || 3, snooze_until: v.snooze_until || null }, v: v };
}
function partyJob(id) {
  var v = readForm($('#f-party'));
  if (!v.name) { $('#name').parentNode.classList.add('text-field--error'); return { error: 'Niet opgeslagen: vul een naam in' }; }
  var row = { name: v.name, type_id: v.type_id || null, city: v.city || null, website: v.website || null, notes: v.notes || null };
  if (!S.needsMigration) {
    row.focus = readChips('focus'); row.markets = readTags('markets');
    row.pipeline_stage = v.pipeline_stage || null; row.pipeline_next_step = v.pipeline_next_step || null; row.pipeline_next_date = v.pipeline_next_date || null;
    var old = id ? IX.party[id] : null;
    if (row.pipeline_stage && !(old && old.pipeline_since && old.pipeline_stage)) row.pipeline_since = todayIso();
  }
  return { table: 'parties', id: id, row: row };
}

function pipelineBlock(p) {
  if (!inPipeline(p)) return '';
  var st = STAGE[p.pipeline_stage], open = STAGES.filter(function (x) { return x.key !== 'afgevallen'; });
  var lost = st.key === 'afgevallen', cur = open.findIndex(function (x) { return x.key === st.key; });
  var next = !st.closed ? STAGES[st.i + 1] : null, d = parseDate(p.pipeline_next_date);
  return '<div class="base-container side-block"><div class="side-block__title">Sales pipeline' + (p.pipeline_since ? '<span class="muted" style="font-weight:400;font-size:12px">sinds ' + esc(fmtDate(p.pipeline_since)) + '</span>' : '') + '</div>' +
    '<div class="psteps' + (lost ? ' psteps--lost' : '') + '" role="img" aria-label="Fase: ' + esc(st.title) + '">' + open.map(function (x, i) { return '<span class="psteps__bar' + (!lost && i <= cur ? ' psteps__bar--on' : '') + '"></span>'; }).join('') + '</div>' +
    '<div class="psteps__labels"><span>' + esc(open[0].title) + '</span><strong>' + esc(st.title) + '</strong><span>' + esc(open[open.length - 1].title) + '</span></div>' +
    '<dl class="kv mt16"><dt>Volgende stap</dt><dd>' + esc(p.pipeline_next_step || '—') + '</dd><dt>Wanneer</dt><dd>' + (d ? esc(fmtDate(d, true)) : '—') + '</dd></dl>' +
    (next ? '<div class="form-actions-inline"><button class="btn" type="button" data-act="stage" data-id="' + esc(p.id) + '" data-stage="' + next.key + '">Naar ' + esc(next.title.toLowerCase()) + icon('chevron-right', 'btn__icon-right') + '</button></div>' : '') + '</div>';
}
function timelineBlock(cs) {
  var xs = [];
  cs.forEach(function (c) { (IX.byContact[c.id] || []).forEach(function (x) { xs.push({ x: x, c: c }); }); });
  xs.sort(function (a, b) { return a.x.date < b.x.date ? 1 : a.x.date > b.x.date ? -1 : 0; });
  var more = xs.length - 8; xs = xs.slice(0, 8);
  return '<div class="base-container side-block"><div class="side-block__title">Tijdlijn</div>' +
    (xs.length ? '<ol class="tline">' + xs.map(function (o) {
      return '<li class="tline__item"><span class="tline__icon">' + icon(kindIcon(o.x.kind), 'icon--14') + '</span><div class="tline__body"><div class="tline__head"><span class="tline__title">' + esc(o.x.kind) + ' met <a href="#contact/' + esc(o.c.id) + '">' + esc(fullName(o.c)) + '</a></span><span class="tline__date">' + esc(fmtDate(o.x.date, true)) + '</span>' +
        '<button class="btn btn--icon-only compact tline__edit" type="button" data-act="edit-interaction" data-id="' + esc(o.x.id) + '" aria-label="Bewerken">' + icon('pencil', 'icon--14') + '</button></div>' +
        (o.x.notes ? '<p class="tline__notes">' + esc(o.x.notes) + '</p>' : '') + '</div></li>';
    }).join('') + '</ol>' + (more > 0 ? '<p class="muted" style="padding-bottom:12px">En nog ' + more + ' eerder.</p>' : '') : '<p class="muted" style="padding-bottom:12px">Nog geen gesprekken met mensen van deze partij.</p>') + '</div>';
}

/* ---------- INSTELLINGEN ---------- */
function vInstellingen() {
  var types = S.types.map(function (t, i) {
    var n = S.parties.filter(function (p) { return p.type_id === t.id; }).length;
    return '<div class="type-row"><span class="text-field"><input class="text-field__input" type="text" value="' + esc(t.name) + '" data-type-name="' + esc(t.id) + '" aria-label="Naam partijtype"></span>' +
      '<span class="type-row__count">' + plural(n, 'partij', 'partijen') + '</span>' +
      '<button class="btn btn--icon-only compact" type="button" data-act="type-up" data-id="' + esc(t.id) + '" aria-label="Omhoog"' + (i === 0 ? ' disabled' : '') + '><svg class="icon icon--14" style="transform:rotate(180deg)"><use href="#i-chevron-down"/></svg></button>' +
      '<button class="btn btn--icon-only compact" type="button" data-act="type-down" data-id="' + esc(t.id) + '" aria-label="Omlaag"' + (i === S.types.length - 1 ? ' disabled' : '') + '>' + icon('chevron-down', 'icon--14') + '</button>' +
      '<button class="btn btn--icon-only compact" type="button" data-act="type-delete" data-id="' + esc(t.id) + '" aria-label="Verwijderen">' + icon('trash', 'icon--14') + '</button></div>';
  }).join('');
  return '<section class="container"><div class="main-column">' + actionbar('Instellingen') +
    '<div class="base-container base-container--padding">' +
    '<fieldset class="fieldset"><div class="fieldset__header">' + icon('building') + 'Partijtypes</div>' + types +
    '<div class="type-row mt16"><span class="text-field"><input class="text-field__input" type="text" id="new-type" placeholder="Nieuw type, bijv. Bank"></span><button class="btn compact" type="button" data-act="type-add">' + icon('plus', 'icon--14') + '<span class="btn__text">Toevoegen</span></button></div></fieldset>' +
    '<fieldset class="fieldset"><div class="fieldset__header">' + icon('clock') + 'Actielijst</div>' +
    fieldRow('Standaard interval', 'def-int', '<select class="select" id="def-int" style="width:160px" data-act-change="default-interval">' + INTERVALS.map(function (n) { return '<option value="' + n + '"' + (n === +S.settings.default_interval_months ? ' selected' : '') + '>' + plural(n, 'maand', 'maanden') + '</option>'; }).join('') + '</select>') +
    '<p class="form-input__hint">Geldt voor nieuwe contacten. Per contact pas je het interval aan op de contactpagina.</p></fieldset>' +
    '<fieldset class="fieldset"><div class="fieldset__header">' + icon('download') + 'Gegevens</div>' +
    '<div class="demo-row" style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn" type="button" data-act="export">' + icon('download', 'icon--14') + '<span class="btn__text">Exporteren (JSON)</span></button>' +
    '<button class="btn" type="button" data-act="import">' + icon('inbox', 'icon--14') + '<span class="btn__text">Importeren…</span></button><input type="file" id="import-file" accept=".json,application/json" class="hidden"></div>' +
    '<p class="form-input__hint">De export is een back-up van alles. Importeren voegt contacten en partijen toe uit een JSON-bestand; bestaande namen worden overgeslagen.</p></fieldset>' +
    '<fieldset class="fieldset" style="margin-bottom:0"><div class="fieldset__header">' + icon('user') + 'Account</div>' +
    fieldRow('Je naam', 'display-name', '<span class="text-field text-field--wide"><input class="text-field__input" type="text" id="display-name" maxlength="40" value="' + esc(displayName()) + '" placeholder="Bijv. Ralph" data-act-change="display-name" autocomplete="given-name"></span>') +
    '<p class="form-input__hint">Zo spreekt het CRM je aan in de begroeting en de bovenbalk. Laat leeg voor alleen je e-mailadres.</p>' +
    '<dl class="kv kv--form mt16"><dt>Ingelogd als</dt><dd>' + esc(Store.user ? Store.user.email : '') + '</dd><dt>Database</dt><dd>' + (DEMO ? 'Demo (niets wordt opgeslagen)' : 'Supabase') + '</dd></dl>' +
    '<div class="mt16"><button class="btn" type="button" data-act="logout">' + icon('logout', 'icon--14') + '<span class="btn__text">Uitloggen</span></button></div></fieldset>' +
    '</div></div></section>';
}

/* ============================================================
   DIALOGEN EN MELDINGEN
   ============================================================ */
var popupResolve = null;
function openPopup(opts) {
  var el = $('#popup');
  el.classList.toggle('popup--small', !!opts.small);
  $('#popup-title').textContent = opts.title;
  $('#popup-body').innerHTML = opts.body;
  $('#popup-footer').innerHTML = (opts.buttons || []).map(function (b, i) { return '<button class="btn ' + (b.cls || '') + '" type="button" data-pbtn="' + i + '"><span class="btn__text">' + esc(b.label) + '</span></button>'; }).join('');
  $('#overlay').classList.add('overlay--open'); el.classList.add('popup--open');
  var f = $('[data-autofocus]', el) || $('input,select,textarea', el); if (f) setTimeout(function () { f.focus(); }, 30);
  return new Promise(function (res) {
    popupResolve = function (i) { var v = i === null ? null : (opts.buttons[i].value !== undefined ? opts.buttons[i].value : i); res(v); };
    $all('[data-pbtn]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.pbtn, btn = opts.buttons[i];
        if (btn.validate && !btn.validate()) return;
        var data = opts.collect ? opts.collect() : null;
        closePopup(); res(btn.value === false ? null : (data !== null ? { button: i, data: data } : i));
      });
    });
  });
}
function closePopup() { $('#overlay').classList.remove('overlay--open'); $('#popup').classList.remove('popup--open'); if (popupResolve) { var r = popupResolve; popupResolve = null; } }
function cancelPopup() { var r = popupResolve; closePopup(); if (r) r(null); }
function confirmPopup(title, text, okLabel) {
  return openPopup({ small: true, title: title, body: '<p class="muted" style="text-align:center">' + esc(text) + '</p>', buttons: [{ label: okLabel, cls: 'btn--danger', value: true }, { label: 'Annuleren', value: false }] }).then(function (v) { return v === 0 || v === true; });
}
var toastTimer;
function toast(msg, kind) {
  var t = $('#toast');
  t.className = 'alert toast alert--' + (kind || 'success');
  t.innerHTML = icon(kind === 'danger' ? 'alert' : 'check-circle', 'alert__icon') + '<span class="alert__body">' + esc(msg) + '</span>';
  requestAnimationFrame(function () { t.classList.add('toast--open'); });
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('toast--open'); }, kind === 'danger' ? 6000 : 2400);
}
function fail(e) { console.error(e); toast('Niet opgeslagen: ' + (e && e.message ? e.message : e), 'danger'); }

function interactionDialog(c, x) {
  var isNew = !x; x = x || { date: todayIso(), kind: 'Meeting', notes: '' };
  var body = '<p class="muted" style="margin-bottom:16px">' + esc(fullName(c)) + (partyOf(c) ? ' · ' + esc(partyOf(c).name) : '') + '</p>' +
    fieldRow('Datum', 'x-date', textInput('x-date', x.date, { type: 'date' })) +
    fieldRow('Soort', 'x-kind', '<div class="segmented-wrap"><div class="radio-group--segmented" role="radiogroup">' + KINDS.map(function (k) { return '<label class="radio-group__item"><input type="radio" name="x-kind" value="' + k + '"' + (k === x.kind ? ' checked' : '') + '><span class="radio-group__label">' + k + '</span></label>'; }).join('') + '</div></div>') +
    fieldRow('Notitie', 'x-notes', '<textarea class="textarea" id="x-notes" data-autofocus placeholder="Waar ging het over? (optioneel)">' + esc(x.notes || '') + '</textarea>', true) +
    (c.recurring ? '<p class="form-input__hint" style="margin-left:170px" id="x-hint"></p>' : '');
  var buttons = [{ label: isNew ? 'Vastleggen' : 'Opslaan', cls: 'btn--primary', validate: function () { return !!$('#x-date').value; } }, { label: 'Annuleren', value: false }];
  if (!isNew) buttons.push({ label: 'Verwijderen', cls: 'btn--danger', value: 'delete' });
  var p = openPopup({ title: isNew ? 'Contactmoment vastleggen' : 'Contactmoment bewerken', body: body, buttons: buttons,
    collect: function () { var k = $('input[name="x-kind"]:checked'); return { date: $('#x-date').value, kind: k ? k.value : 'Overig', notes: $('#x-notes').value.trim() }; } });
  var hint = $('#x-hint');
  function upd() { if (!hint) return; var d = parseDate($('#x-date').value); if (d) hint.textContent = 'Volgende keer op de actielijst: ' + fmtDate(addMonths(d, c.interval_months || 3), true) + '.'; }
  if (hint) { upd(); $('#x-date').addEventListener('input', upd); }
  return p;
}

/* ============================================================
   ACTIES
   ============================================================ */
async function reload(silent) {
  try { setData(await Store.loadAll()); render(); }
  catch (e) { if (!silent) fail(e); }
}
async function actSpoken(id) {
  var c = IX.contact[id]; if (!c) return;
  var r = await interactionDialog(c);
  if (!r || typeof r !== 'object') return;
  try {
    var x = await Store.insert('interactions', { contact_id: c.id, date: r.data.date, kind: r.data.kind, notes: r.data.notes || null });
    S.interactions.push(x);
    if (c.snooze_until) { Object.assign(c, await Store.update('contacts', c.id, { snooze_until: null })); }
    index(); render();
    var d = nextDue(c);
    toast(c.recurring && d ? fullName(c) + ' staat weer op ' + fmtDate(d, true) + '.' : 'Contactmoment vastgelegd.');
  } catch (e) { fail(e); }
}
async function actEditInteraction(xid) {
  var x = S.interactions.find(function (i) { return i.id === xid; }); if (!x) return;
  var c = IX.contact[x.contact_id];
  var r = await interactionDialog(c, x);
  if (r === 'delete') {
    if (!(await confirmPopup('Contactmoment verwijderen?', 'Dit kan niet ongedaan worden gemaakt.', 'Verwijderen'))) return;
    try { await Store.remove('interactions', x.id); S.interactions = S.interactions.filter(function (i) { return i.id !== x.id; }); index(); render(); toast('Contactmoment verwijderd.'); } catch (e) { fail(e); }
    return;
  }
  if (!r || typeof r !== 'object') return;
  try { var u = await Store.update('interactions', x.id, { date: r.data.date, kind: r.data.kind, notes: r.data.notes || null }); Object.assign(x, u); index(); render(); toast('Opgeslagen.'); } catch (e) { fail(e); }
}
async function actSnooze(id, until) {
  var c = IX.contact[id]; if (!c) return;
  try { Object.assign(c, await Store.update('contacts', id, { snooze_until: until })); index(); render(); toast(until ? fullName(c) + ' uitgesteld tot ' + fmtDate(until, true) + '.' : 'Uitstel opgeheven.'); } catch (e) { fail(e); }
}
async function actSnoozeDate(id) {
  var c = IX.contact[id];
  var r = await openPopup({ small: true, title: 'Uitstellen tot', body: '<p class="muted" style="text-align:center;margin-bottom:16px">' + esc(fullName(c)) + '</p><div style="display:flex;justify-content:center">' + textInput('s-date', isoDate(addDays(today(), 14)), { type: 'date' }) + '</div>',
    buttons: [{ label: 'Uitstellen', cls: 'btn--primary', validate: function () { return !!$('#s-date').value; } }, { label: 'Annuleren', value: false }], collect: function () { return $('#s-date').value; } });
  if (r && r.data) actSnooze(id, r.data);
}
function readForm(form) {
  var o = {}; $all('input[name],select[name],textarea[name]', form).forEach(function (el) { o[el.name] = el.value.trim(); }); return o;
}
async function newPartyDialog(prefill) {
  var r = await openPopup({ title: 'Nieuwe partij', body: fieldRow('Naam', 'np-name', textInput('np-name', prefill || '', { cls: 'text-field--full', af: true })) + fieldRow('Type', 'np-type', '<select class="select" id="np-type">' + typeOptions('', 'Geen type') + '</select>') + fieldRow('Plaats', 'np-city', textInput('np-city', '', { cls: 'text-field--wide' })),
    buttons: [{ label: 'Toevoegen', cls: 'btn--primary', validate: function () { var ok = !!$('#np-name').value.trim(); $('#np-name').parentNode.classList.toggle('text-field--error', !ok); return ok; } }, { label: 'Annuleren', value: false }],
    collect: function () { return { name: $('#np-name').value.trim(), type_id: $('#np-type').value || null, city: $('#np-city').value.trim() || null }; } });
  if (!r || !r.data) return null;
  var dupe = S.parties.find(function (p) { return norm(p.name) === norm(r.data.name); });
  if (dupe) { toast('Partij bestond al; die is gekozen.'); return dupe; }
  try { var p = await Store.insert('parties', r.data); S.parties.push(p); index(); return p; } catch (e) { fail(e); return null; }
}
async function actSaveContact(again) {
  var job = contactJob(null);
  if (job.error) { $('#last_name').focus(); toast('Vul in elk geval een achternaam in.', 'danger'); return; }
  try {
    var c = await Store.insert('contacts', job.row); S.contacts.push(c);
    if (job.v.last_spoken) S.interactions.push(await Store.insert('interactions', { contact_id: c.id, date: job.v.last_spoken, kind: 'Overig', notes: 'Vastgelegd bij het toevoegen van het contact.' }));
    index(); dirty = false; toast(fullName(c) + ' toegevoegd.');
    if (again) { var keep = job.row.party_id; render(); if (keep && $('#party_id')) $('#party_id').value = keep; var f = $('#first_name'); if (f) f.focus(); window.scrollTo(0, 0); }
    else go(backHash());
  } catch (e) { fail(e); }
}
async function actSaveParty() {
  var job = partyJob(null);
  if (job.error) { $('#name').focus(); toast('Vul een naam in.', 'danger'); return; }
  try { var p = await Store.insert('parties', job.row); S.parties.push(p); index(); dirty = false; toast(p.name + ' toegevoegd.'); go(backHash()); } catch (e) { fail(e); }
}
async function actDeleteContact(id) {
  var c = IX.contact[id];
  var n = (IX.byContact[id] || []).length;
  if (!(await confirmPopup(fullName(c) + ' verwijderen?', 'Het contact' + (n ? ' en ' + plural(n, 'contactmoment', 'contactmomenten') : '') + ' worden definitief verwijderd.', 'Verwijderen'))) return;
  try { await Store.remove('contacts', id); S.contacts = S.contacts.filter(function (x) { return x.id !== id; }); S.interactions = S.interactions.filter(function (x) { return x.contact_id !== id; }); index(); dirty = false; toast('Verwijderd.'); go('contacten'); } catch (e) { fail(e); }
}
async function actDeleteParty(id) {
  var p = IX.party[id], n = (IX.byParty[id] || []).length;
  if (!(await confirmPopup(p.name + ' verwijderen?', n ? 'De ' + plural(n, 'persoon', 'personen') + ' bij deze partij blijven bestaan, maar zonder partij.' : 'De partij wordt definitief verwijderd.', 'Verwijderen'))) return;
  try { await Store.remove('parties', id); S.parties = S.parties.filter(function (x) { return x.id !== id; }); S.contacts.forEach(function (c) { if (c.party_id === id) c.party_id = null; }); index(); dirty = false; toast('Verwijderd.'); go('partijen'); } catch (e) { fail(e); }
}
async function ensureTypes() {
  if (S.types.length) return;
  try { var rows = await Store.insertMany('party_types', DEFAULT_TYPES.map(function (n, i) { return { name: n, sort: i }; })); S.types = rows.sort(function (a, b) { return a.sort - b.sort; }); index(); } catch (e) { fail(e); }
}
async function actTypeMove(id, dir) {
  var i = S.types.findIndex(function (t) { return t.id === id; }), j = i + dir;
  if (j < 0 || j >= S.types.length) return;
  var a = S.types[i], b = S.types[j];
  S.types[i] = b; S.types[j] = a;
  try { await Promise.all(S.types.map(function (t, k) { if (t.sort === k) return null; t.sort = k; return Store.update('party_types', t.id, { sort: k }); })); index(); render(); } catch (e) { fail(e); }
}
async function actTypeDelete(id) {
  var t = IX.type[id], n = S.parties.filter(function (p) { return p.type_id === id; }).length;
  if (!(await confirmPopup('"' + t.name + '" verwijderen?', n ? plural(n, 'partij houdt', 'partijen houden') + ' dan geen type.' : 'Dit type wordt verwijderd.', 'Verwijderen'))) return;
  try { await Store.remove('party_types', id); S.types = S.types.filter(function (x) { return x.id !== id; }); S.parties.forEach(function (p) { if (p.type_id === id) p.type_id = null; }); index(); render(); toast('Verwijderd.'); } catch (e) { fail(e); }
}
async function actTypeAdd() {
  var el = $('#new-type'), name = el.value.trim(); if (!name) { el.focus(); return; }
  if (S.types.some(function (t) { return norm(t.name) === norm(name); })) { toast('Dat type bestaat al.', 'danger'); return; }
  try { S.types.push(await Store.insert('party_types', { name: name, sort: S.types.length })); index(); render(); toast('Type toegevoegd.'); } catch (e) { fail(e); }
}
async function actTypeRename(id, name) {
  var t = IX.type[id]; name = name.trim(); if (!t || !name || name === t.name) return;
  try { Object.assign(t, await Store.update('party_types', id, { name: name })); index(); toast('Opgeslagen.'); } catch (e) { fail(e); }
}
function actExport() {
  var data = { exported_at: new Date().toISOString(), party_types: S.types, parties: S.parties, contacts: S.contacts, interactions: S.interactions, settings: S.settings };
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  var d = new Date(); a.download = String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + ' CRM export.json';
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/* Import: { parties:[{name,type,city,website,notes}], contacts:[{first_name,last_name,role,party,email,phone,linkedin,notes,recurring,interval_months,last_contact}] } */
async function actImport(file) {
  var data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('Dit is geen geldig JSON-bestand.', 'danger'); return; }
  var ps = data.parties || [], cs = data.contacts || [];
  if (!(await confirmPopup('Importeren?', plural(ps.length, 'partij', 'partijen') + ' en ' + plural(cs.length, 'contact', 'contacten') + ' in het bestand. Namen die al bestaan worden overgeslagen.', 'Importeren'))) return;
  try {
    var typeByName = {}; S.types.forEach(function (t) { typeByName[norm(t.name)] = t; });
    var partyByName = {}; S.parties.forEach(function (p) { partyByName[norm(p.name)] = p; });
    var needTypes = [];
    ps.concat(cs.map(function (c) { return { type: c.party_type }; })).forEach(function (p) { if (p.type && !typeByName[norm(p.type)] && needTypes.indexOf(p.type) < 0) needTypes.push(p.type); });
    (await Store.insertMany('party_types', needTypes.map(function (n, i) { return { name: n, sort: S.types.length + i }; }))).forEach(function (t) { S.types.push(t); typeByName[norm(t.name)] = t; });
    var newParties = [];
    ps.concat(cs.filter(function (c) { return c.party; }).map(function (c) { return { name: c.party, type: c.party_type }; })).forEach(function (p) {
      if (!p.name || partyByName[norm(p.name)] || newParties.some(function (x) { return norm(x.name) === norm(p.name); })) return;
      var np = { name: p.name, type_id: p.type && typeByName[norm(p.type)] ? typeByName[norm(p.type)].id : null, city: p.city || null, website: p.website || null, notes: p.notes || null };
      if (!S.needsMigration) { np.focus = arr(p.focus).filter(function (f) { return FOCUS.indexOf(f) >= 0; }); np.markets = arr(p.markets); }
      newParties.push(np);
    });
    (await Store.insertMany('parties', newParties)).forEach(function (p) { S.parties.push(p); partyByName[norm(p.name)] = p; });
    var existing = {}; S.contacts.forEach(function (c) { existing[norm(fullName(c))] = true; });
    var rows = [], lasts = [];
    cs.forEach(function (c) {
      var nm = norm([c.first_name, c.last_name].filter(Boolean).join(' '));
      if (!c.last_name || existing[nm]) return; existing[nm] = true;
      rows.push({ first_name: c.first_name || null, last_name: c.last_name, role: c.role || null, party_id: c.party && partyByName[norm(c.party)] ? partyByName[norm(c.party)].id : null, email: c.email || null, phone: c.phone || null, linkedin: c.linkedin || null, notes: c.notes || null,
        recurring: !!c.recurring, interval_months: +c.interval_months || +S.settings.default_interval_months || 3 });
      lasts.push(c.last_contact || null);
    });
    var made = await Store.insertMany('contacts', rows);
    made.forEach(function (c) { S.contacts.push(c); });
    var xs = [];
    made.forEach(function (c, i) { if (lasts[i]) xs.push({ contact_id: c.id, date: lasts[i], kind: 'Overig', notes: 'Laatste contact uit import.' }); });
    (await Store.insertMany('interactions', xs)).forEach(function (x) { S.interactions.push(x); });
    index(); render(); toast(plural(made.length, 'contact', 'contacten') + ' en ' + plural(newParties.length, 'partij', 'partijen') + ' geïmporteerd.');
  } catch (e) { fail(e); }
}

/* ============================================================
   GEBEURTENISSEN
   ============================================================ */
var dirty = false;
function closeMenus(except) {
  $all('.drpdwn--open').forEach(function (d) { if (d !== except) { d.classList.remove('drpdwn--open'); var b = $('[data-drpdwn]', d); if (b) b.setAttribute('aria-expanded', 'false'); } });
}
function bindEvents() {
  document.addEventListener('click', function (e) {
    var t = e.target;
    var dd = t.closest('[data-drpdwn]');
    if (dd) { e.preventDefault(); e.stopPropagation(); var d = dd.closest('.drpdwn'), open = !d.classList.contains('drpdwn--open'); closeMenus(d); d.classList.toggle('drpdwn--open', open); dd.setAttribute('aria-expanded', open ? 'true' : 'false'); return; }
    if (!t.closest('.drpdwn__menu')) closeMenus();
    var a = t.closest('[data-act]');
    if (a && !a.disabled) {
      e.preventDefault(); e.stopPropagation(); closeMenus();
      var id = a.dataset.id;
      switch (a.dataset.act) {
        case 'spoken': actSpoken(id); break;
        case 'snooze': actSnooze(id, isoDate(addDays(today(), +a.dataset.days))); break;
        case 'snooze-date': actSnoozeDate(id); break;
        case 'unsnooze': actSnooze(id, null); break;
        case 'add-interaction': actSpoken(id); break;
        case 'edit-interaction': actEditInteraction(id); break;
        case 'save-contact': actSaveContact(!!a.dataset.again); break;
        case 'save-party': actSaveParty(); break;
        case 'delete-contact': actDeleteContact(id); break;
        case 'delete-party': actDeleteParty(id); break;
        case 'back': dirty = false; go(backHash()); break;
        case 'type-up': actTypeMove(id, -1); break;
        case 'type-down': actTypeMove(id, 1); break;
        case 'type-delete': actTypeDelete(id); break;
        case 'type-add': actTypeAdd(); break;
        case 'export': actExport(); break;
        case 'stage': actStage(id, a.dataset.stage); break;
        case 'new-lead': actNewLead(); break;
        case 'import': $('#import-file').click(); break;
        case 'logout': Store.signOut().then(function () { location.hash = ''; location.reload(); }); break;
      }
      return;
    }
    var chip = t.closest('[data-chip]');
    if (chip) { e.preventDefault(); var on = !chip.classList.contains('chip--on'); chip.classList.toggle('chip--on', on); chip.setAttribute('aria-pressed', on); chip.innerHTML = (on ? icon('check', 'icon--12') : '') + esc(chip.dataset.chip); dirty = true; autosaveSoon(300); return; }
    if (t.closest('[data-tag-remove]')) { e.preventDefault(); t.closest('[data-tag]').remove(); dirty = true; autosaveSoon(300); return; }
    if (t.closest('[data-tag-add]')) { e.preventDefault(); addTag(t.closest('.tags')); return; }
    var so = t.closest('[data-sort]');
    if (so) { e.preventDefault(); var sp = so.dataset.sort.split(':'); setSort(sp[0], sp[1]); return; }
    var ft = t.closest('[data-filter-toggle]');
    if (ft) { e.preventDefault(); S.filters[ft.dataset.filterToggle] = !S.filters[ft.dataset.filterToggle]; render(); return; }
    var cf = t.closest('[data-clear-filters]');
    if (cf) { e.preventDefault(); cf.dataset.clearFilters.split(',').forEach(function (k) { S.filters[k] = typeof S.filters[k] === 'boolean' ? false : ''; }); render(); return; }
    var sw = t.closest('.switch');
    if (sw && sw.id === 'recurring') {
      var on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', on ? 'true' : 'false');
      $('#rec-fields').classList.toggle('hidden', !on); $('#recurring-hint').textContent = on ? 'Staat op de actielijst' : 'Staat niet op de actielijst'; dirty = true; autosaveSoon(200); return;
    }
    var h = t.closest('[data-href]');
    if (h && !t.closest('a,button:not([data-href]),input,select,label')) { e.preventDefault(); go(h.dataset.href.replace(/^#/, '')); return; }
    if (h && h.tagName === 'BUTTON') { e.preventDefault(); go(h.dataset.href.replace(/^#/, '')); }
  });
  document.addEventListener('change', async function (e) {
    var t = e.target;
    if (t.dataset.filter) { S.filters[t.dataset.filter] = t.type === 'checkbox' ? t.checked : t.value; render(); return; }
    if (t.dataset.sortSelect) { var sv = t.value.split(':'); S.sort[t.dataset.sortSelect] = { k: sv[0], d: +sv[1] }; try { localStorage.setItem('crm.sort', JSON.stringify(S.sort)); } catch (x) {} render(); return; }
    if (t.hasAttribute('data-afilter')) { go('actielijst' + (t.value === 'alles' ? '' : '/' + t.value)); return; }
    if (t.dataset.typeName) { actTypeRename(t.dataset.typeName, t.value); return; }
    if (t.dataset.actChange === 'show-closed') { S.showClosed = t.checked; render(); return; }
    if (t.dataset.actChange === 'display-name') { try { await Store.setName(t.value.trim().slice(0, 40)); showUserName(); toast('Opgeslagen.'); } catch (err) { fail(err); } return; }
    if (t.dataset.actChange === 'default-interval') { try { S.settings = await Store.saveSettings({ default_interval_months: +t.value }); toast('Opgeslagen.'); } catch (err) { fail(err); } return; }
    if (t.id === 'party_id' && t.value === '__new') {
      var p = await newPartyDialog();
      if (p) { t.innerHTML = partyOptions(p.id, 'Geen partij') + '<option value="__new">+ Nieuwe partij…</option>'; } else { t.value = (IX.contact[route.id] && IX.contact[route.id].party_id) || ''; }
      autosaveSoon(0); return;
    }
    if (t.closest('#f-contact,#f-party') && (t.tagName === 'SELECT' || t.type === 'date')) { autosaveSoon(0); return; }
    if (t.id === 'import-file' && t.files[0]) { actImport(t.files[0]); t.value = ''; }
    if (t.closest('#f-contact,#f-party') && Auto.timer) autosaveNow();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.closest('#f-contact,#f-party') && !t.hasAttribute('data-tag-input')) { dirty = true; var tf = t.closest('.text-field--error'); if (tf && t.value.trim()) tf.classList.remove('text-field--error'); autosaveSoon(t.tagName === 'TEXTAREA' ? 900 : 700); }
    if (t.id === 'zoek' || t.hasAttribute('data-q')) {
      S.q = t.value;
      $all('#zoek,[data-q]').forEach(function (o) { if (o !== t) o.value = t.value; });
      if (['contacten', 'partijen', 'actielijst', 'pipeline'].indexOf(route.view) < 0) { go('contacten'); }
      else { var pos = t.selectionStart; var isTop = t.id === 'zoek'; render(); var el = isTop ? $('#zoek') : $('#' + t.id); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} } }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenus(); if ($('#popup').classList.contains('popup--open')) cancelPopup(); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.body.classList.contains('auth-mode')) { e.preventDefault(); $('#zoek').focus(); }
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pcard')) { go(e.target.dataset.href.replace(/^#/, '')); return; }
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-tag-input')) { e.preventDefault(); e.stopPropagation(); addTag(e.target.closest('.tags')); return; }
    if (e.key === 'Enter' && e.target.id === 'new-type') { e.preventDefault(); actTypeAdd(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && $('#popup').classList.contains('popup--open')) { var b = $('#popup [data-pbtn="0"]'); if (b) b.click(); }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('#f-contact,#f-party')) { e.preventDefault(); if (onEditPage()) { if (Auto.timer) autosaveNow(); return; } var s = $('[data-act="save-contact"],[data-act="save-party"]'); if (s) s.click(); }
  });
  $('#overlay').addEventListener('click', cancelPopup);
  var dragId = null;
  document.addEventListener('dragstart', function (e) { var c = e.target.closest && e.target.closest('.pcard'); if (!c) return; dragId = c.dataset.pid; c.classList.add('pcard--dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
  document.addEventListener('dragend', function () { dragId = null; $all('.pcard--dragging').forEach(function (c) { c.classList.remove('pcard--dragging'); }); $all('.pcol--over').forEach(function (c) { c.classList.remove('pcol--over'); }); });
  document.addEventListener('dragover', function (e) { var b = e.target.closest && e.target.closest('.pcol'); if (!b || !dragId) return; e.preventDefault(); $all('.pcol--over').forEach(function (c) { if (c !== b) c.classList.remove('pcol--over'); }); b.classList.add('pcol--over'); });
  document.addEventListener('drop', function (e) { var b = e.target.closest && e.target.closest('.pcol'); if (!b || !dragId) return; e.preventDefault(); var id = dragId; dragId = null; b.classList.remove('pcol--over'); actStage(id, b.dataset.stage); });
  window.addEventListener('hashchange', function (e) { prevHash = (e.oldURL || '').split('#')[1] || ''; dirty = false; render(); window.scrollTo(0, 0); });
  window.addEventListener('beforeunload', function (e) { if (Auto.timer) autosaveNow(); if (dirty || Auto.busy) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !dirty && Store.user && Date.now() - S.loadedAt > 60000 && !$('#popup').classList.contains('popup--open')) reload(true); });
  $all('[data-toggle]').forEach(function (tg) { tg.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); var li = tg.closest('.sidenav__item'), open = li.classList.toggle('sidenav__item--open'); tg.setAttribute('aria-expanded', open ? 'true' : 'false'); }); });
  $('#inklappen').addEventListener('click', function (e) { e.preventDefault(); document.body.classList.toggle('sidenav-collapsed'); try { localStorage.setItem('crm.collapsed', document.body.classList.contains('sidenav-collapsed') ? '1' : ''); } catch (x) {} });
  try { if (localStorage.getItem('crm.collapsed')) document.body.classList.add('sidenav-collapsed'); } catch (x) {}
}

/* ============================================================
   INLOGGEN EN OPSTARTEN
   ============================================================ */
function showAuth(mode, msg) {
  document.body.classList.add('auth-mode');
  var box = $('#auth-box');
  if (mode === 'config') {
    box.innerHTML = '<div class="auth__title">Database koppelen</div><p class="auth__lead">Vul de Project URL en de publishable key van je Supabase-project in. Ze worden alleen in deze browser bewaard.</p>' +
      '<form id="f-config"><div class="auth__field"><label for="cfg-url">Project URL</label><input class="text-field__input" id="cfg-url" type="url" placeholder="https://xxxx.supabase.co" required></div>' +
      '<div class="auth__field"><label for="cfg-key">Publishable key</label><input class="text-field__input" id="cfg-key" type="text" placeholder="sb_publishable_…" required></div>' +
      '<div class="auth__actions"><button class="btn btn--primary" type="submit"><span class="btn__text">Koppelen</span></button></div></form>';
    $('#f-config').addEventListener('submit', function (e) { e.preventDefault(); try { localStorage.setItem('crm.config', JSON.stringify({ url: $('#cfg-url').value.trim(), key: $('#cfg-key').value.trim() })); } catch (x) {} location.reload(); });
    return;
  }
  var signup = mode === 'signup';
  box.innerHTML = '<div class="auth__title">' + (signup ? 'Account aanmaken' : 'Inloggen') + '</div><p class="auth__lead">' + (signup ? 'Eenmalig. Zet daarna in Supabase nieuwe aanmeldingen uit.' : 'Log in om je contacten te openen.') + '</p>' +
    '<form id="f-auth"><div class="auth__field"><label for="a-email">E-mailadres</label><input class="text-field__input" id="a-email" type="email" autocomplete="username" required></div>' +
    '<div class="auth__field"><label for="a-pw">Wachtwoord</label><input class="text-field__input" id="a-pw" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="8" required></div>' +
    '<div class="auth__actions"><button class="btn btn--primary" type="submit" id="a-submit"><span class="btn__text">' + (signup ? 'Account aanmaken' : 'Inloggen') + '</span></button></div>' +
    '<div class="auth__error" id="a-err" role="alert">' + esc(msg || '') + '</div></form>' +
    '<div class="auth__switch">' + (signup ? '<a data-auth="login">Ik heb al een account</a>' : 'Eerste keer? <a data-auth="signup">Account aanmaken</a>') + '</div>';
  $('[data-auth]', box).addEventListener('click', function () { showAuth(this.dataset.auth); });
  $('#a-email').focus();
  $('#f-auth').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('#a-submit'); btn.disabled = true; $('#a-err').textContent = '';
    var email = $('#a-email').value.trim(), pw = $('#a-pw').value;
    try {
      if (signup) {
        var d = await Store.signUp(email, pw);
        if (d.session) { await start(d.session); return; }
        showAuth('login', ''); $('#a-email').value = email;
        $('#a-err').style.color = 'var(--g600)'; $('#a-err').textContent = 'Account aangemaakt. Bevestig je e-mailadres via de mail van Supabase en log daarna hier in.';
      } else { await start(await Store.signIn(email, pw)); }
    } catch (err) {
      var m = err.message || String(err);
      if (/invalid login/i.test(m)) m = 'E-mailadres of wachtwoord klopt niet.';
      else if (/email not confirmed/i.test(m)) m = 'Je e-mailadres is nog niet bevestigd. Klik eerst op de link in de mail van Supabase.';
      else if (/signups not allowed|signup is disabled/i.test(m)) m = 'Nieuwe accounts zijn uitgeschakeld.';
      $('#a-err').textContent = m; btn.disabled = false;
    }
  });
}
async function start(session) {
  Store.user = session.user;
  document.body.classList.remove('auth-mode');
  showUserName();
  $('#main').innerHTML = '<section class="container"><div class="actionbar"><h1 class="actionbar__title muted">Laden…</h1></div></section>';
  try { setData(await Store.loadAll()); }
  catch (e) {
    console.error(e);
    $('#main').innerHTML = '<section class="container">' + actionbar('Kan de database niet lezen') + '<div class="alert alert--danger">' + icon('alert', 'alert__icon') + '<div class="alert__body">' + esc(e.message || e) +
      '<div class="muted" style="font-weight:400;margin-top:4px">Is het schema (crm-schema.sql) in Supabase uitgevoerd? Staat het project misschien op pauze? Zet het dan in het Supabase-dashboard weer aan.</div></div></div></section>';
    return;
  }
  await ensureTypes();
  if (!S.settings.owner_id && !DEMO) { try { S.settings = await Store.saveSettings({ default_interval_months: 3 }); } catch (e) {} }
  render();
}
async function boot() {
  bindEvents();
  if (DEMO) { Demo.build(); $('#demo-flag').classList.remove('hidden'); return start(await Store.session()); }
  if (Store.init() === 'config') return showAuth('config');
  Store.sb.auth.onAuthStateChange(function (ev, session) { if (ev === 'SIGNED_OUT') { Store.user = null; showAuth('login'); } else if (session) Store.user = session.user; });
  var s = await Store.session();
  if (s) start(s); else showAuth('login');
}
boot();
