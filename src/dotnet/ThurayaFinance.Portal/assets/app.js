/* Al Thuraya Holding - Group Finance Portal: application logic.
   Plain JavaScript with no external dependencies. The dataset (window.ATH.data) is served by the portal
   from SQL Server and the Java treasury service (/portal/data); approvals, holds, budget transfers and
   audit events are saved through the portal's JSON API. */
(function () {
  'use strict';

  const ATH = window.ATH || {};
  const D = ATH.data;
  const STRINGS = ATH.i18n;
  if (!D || !STRINGS) {
    document.body.textContent = ATH.loadError || 'The Group Finance Portal could not load its resources.';
    return;
  }

  /* ---------- Storage and state ---------- */
  function storage(kind) {
    try {
      const s = window[kind];
      s.setItem('ath.probe', '1');
      s.removeItem('ath.probe');
      return s;
    } catch (err) {
      return null;
    }
  }
  const local = storage('localStorage');
  const session = storage('sessionStorage');
  const recall = (key) => (local ? local.getItem(key) : null);
  const remember = (key, value) => { if (local) local.setItem(key, value); };

  const startedAt = new Date();
  const state = {
    lang: recall('ath.lang') === 'ar' ? 'ar' : 'en',
    entity: 'ALL',
    approvals: D.approvals.map((item) => Object.assign({}, item)),
    approvalTab: 'all',
    runDecision: null,
    unread: D.notifications.length,
    syncedAt: startedAt,
    audits: D.audit.filter((entry) => new Date(entry.at) <= startedAt),
    ap: { status: 'open', category: 'all', q: '', sort: 'dueDate', dir: 1, page: 1 },
    ar: { status: 'open', q: '', sort: 'dueDate', dir: 1, page: 1 },
    vendors: { status: 'all', category: 'all', q: '', sort: 'name', dir: 1, page: 1 },
    audit: { user: 'all', action: 'all', q: '', page: 1 },
    transfers: (D.budgetTransfers || []).slice(),
    reportRuns: {},
    pendingDetail: null,
    modalConfirm: null
  };
  const storedEntity = recall('ath.entity');
  if (storedEntity && D.entities.some((e) => e.id === storedEntity)) state.entity = storedEntity;
  const langParam = new URLSearchParams(window.location.search).get('lang');
  if (langParam === 'ar' || langParam === 'en') {
    state.lang = langParam;
    remember('ath.lang', langParam);
  }

  /* ---------- Lookups ---------- */
  const indexBy = (list) => list.reduce((map, item) => { map[item.id] = item; return map; }, {});
  const people = {};
  Object.keys(D.people).forEach((key) => { people[D.people[key].id] = D.people[key]; });
  D.managers.forEach((m) => { people[m.id] = m; });
  const persona = D.people.persona;
  const personaIp = (D.audit.find((a) => a.user === persona.id) || { ip: '10.40.12.31' }).ip;
  const vendorById = indexBy(D.vendors);
  const entityById = indexBy(D.entities);
  const ccById = indexBy(D.costCentres);
  const bankById = indexBy(D.banks);
  const customerById = indexBy(D.customers);
  const invoiceById = indexBy(D.invoices);
  const runById = indexBy(D.paymentRuns);
  const awaitingRun = D.paymentRuns.find((r) => r.status === 'awaiting');
  if (awaitingRun && awaitingRun.decision) state.runDecision = awaitingRun.decision;
  const vendorSpend = {};
  D.invoices.forEach((inv) => {
    if (inv.invoiceDate.slice(0, 4) === String(D.fiscalYear)) vendorSpend[inv.vendorId] = (vendorSpend[inv.vendorId] || 0) + inv.amountQar;
  });

  /* ---------- Server API: the portal's JSON endpoints (anti-forgery token from the page) ---------- */
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
  const API_ERRORS = { ALREADY_DECIDED: 'errAlreadyDecided', INVALID_STATE: 'errInvalidState', TREASURY_UNAVAILABLE: 'errTreasury', CSRF: 'errSession', COMMENT_REQUIRED: 'commentRequired' };
  async function api(path, body) {
    let response;
    try {
      response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(body || {})
      });
    } catch (err) {
      toast(t('errNetwork'), true);
      return null;
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
    if (response.ok && payload) return payload;
    const error = (payload && payload.error) || { code: 'HTTP_' + response.status, message: response.statusText || String(response.status) };
    toast(has(API_ERRORS, error.code) ? t(API_ERRORS[error.code]) : t('errGeneric', { msg: error.message }), true);
    return null;
  }

  /* ---------- Text, escaping and formatting ---------- */
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
  const isAr = () => state.lang === 'ar';
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function t(key, vars) {
    const table = STRINGS[state.lang] || STRINGS.en;
    let text = has(table, key) ? table[key] : has(STRINGS.en, key) ? STRINGS.en[key] : key;
    if (vars) Object.keys(vars).forEach((name) => { text = text.split('{' + name + '}').join(String(vars[name])); });
    return text;
  }
  const T = (key, vars) => esc(t(key, vars));
  // Latin-script names ("... W.L.L.") must be bidi-isolated or their punctuation jumps sides in the Arabic UI.
  const latin = (s) => '<bdi>' + esc(s) + '</bdi>';
  const isolate = (s) => '\u2068' + s + '\u2069';
  function Th(key, htmlVars) {
    const tokens = {};
    const vars = {};
    Object.keys(htmlVars).forEach((name, i) => {
      const token = '\u0001' + i + '\u0001';
      tokens[token] = htmlVars[name];
      vars[name] = token;
    });
    let html = esc(t(key, vars));
    Object.keys(tokens).forEach((token) => { html = html.split(token).join(tokens[token]); });
    return html;
  }
  const nm = (o) => (o ? (isAr() && o.nameAr ? o.nameAr : o.name) : '');
  const roleTitle = (o) => (o ? (isAr() && o.titleAr ? o.titleAr : o.title) : '');

  const locale = () => (isAr() ? 'ar-QA-u-nu-latn' : 'en-GB');
  const formatters = {};
  function fmt(kind, options) {
    const key = locale() + kind + JSON.stringify(options);
    if (!formatters[key]) formatters[key] = kind === 'n' ? new Intl.NumberFormat(locale(), options) : new Intl.DateTimeFormat(locale(), options);
    return formatters[key];
  }
  const num = (v, digits) => fmt('n', { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 }).format(v);
  const pct = (v, digits) => {
    const d = digits === undefined ? 1 : digits;
    return fmt('n', { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  };
  const signedPct = (v) => fmt('n', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(v);
  const currencyLabel = (code) => (isAr() && code === 'QAR' ? 'ر.ق' : code);
  function money(value, digits, code) {
    const text = num(value, digits === undefined ? 2 : digits);
    const label = currencyLabel(code || 'QAR');
    return isAr() ? text + ' ' + label : label + ' ' + text;
  }
  function shortAmount(value) {
    const abs = Math.abs(value);
    const units = isAr() ? [[1e9, ' مليار'], [1e6, ' مليون'], [1e3, ' ألف']] : [[1e9, 'bn'], [1e6, 'M'], [1e3, 'K']];
    for (let i = 0; i < units.length; i++) {
      const size = units[i][0];
      if (abs >= size) {
        const v = value / size;
        const digits = Math.abs(v) >= 100 ? (size === 1e3 ? 0 : 1) : 2;
        return num(v, digits) + units[i][1];
      }
    }
    return num(value, 0);
  }
  function compact(value, code) {
    const label = currencyLabel(code || 'QAR');
    const text = shortAmount(value);
    return isAr() ? text + ' ' + label : label + ' ' + text;
  }
  function axisLabel(value) {
    const abs = Math.abs(value);
    if (abs >= 1e9) return num(value / 1e9, 1) + (isAr() ? ' مليار' : 'bn');
    if (abs >= 1e6) return num(value / 1e6, 0) + (isAr() ? ' م' : 'M');
    if (abs >= 1e3) return num(value / 1e3, 0) + (isAr() ? ' ألف' : 'K');
    return num(value, 0);
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value.length > 10) return new Date(value);
    const parts = value.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const today = parseDate(D.today);
  const daysFromToday = (value) => Math.round((parseDate(value) - today) / 86400000);
  const fmtDate = (value, options) => (value ? fmt('d', options || { day: '2-digit', month: 'short', year: 'numeric' }).format(parseDate(value)) : '—');
  const fmtShort = (value) => fmtDate(value, { day: '2-digit', month: 'short' });
  const fmtTime = (value) => fmt('d', { hour: '2-digit', minute: '2-digit', hour12: false }).format(parseDate(value));
  const fmtDateTime = (value) => fmtDate(value) + ' ' + fmtTime(value);
  const monthName = (m, style) => fmt('d', { month: style || 'short' }).format(new Date(D.fiscalYear, m, 1));
  const priorPeriod = () => (D.currentPeriod === 0 ? { m: 11, y: D.fiscalYear - 1 } : { m: D.currentPeriod - 1, y: D.fiscalYear });
  const periodLabel = (p) => monthName(p.m, 'long') + ' ' + p.y;
  function relTime(value) {
    const minutes = Math.max(1, Math.round((Date.now() - parseDate(value).getTime()) / 60000));
    if (minutes < 60) return t('minutesAgo', { n: minutes });
    if (minutes < 1440) return t('hoursAgo', { n: Math.round(minutes / 60) });
    const days = Math.round(minutes / 1440);
    return days <= 1 ? t('yesterday') : t('daysAgo', { n: days });
  }
  const isWorkday = (d) => d.getDay() !== 5 && d.getDay() !== 6;
  function workdaysBetween(from, to) {
    let n = 0;
    const d = new Date(from);
    while (d <= to) {
      if (isWorkday(d)) n += 1;
      d.setDate(d.getDate() + 1);
    }
    return n;
  }

  /* ---------- Domain helpers ---------- */
  const sum = (list, getter) => list.reduce((total, item) => total + getter(item), 0);
  const inScope = (entityId) => state.entity === 'ALL' || state.entity === entityId;
  const scopeEntities = () => D.entities.filter((e) => inScope(e.id));
  const OPEN_AP = ['pending', 'approved', 'scheduled', 'hold', 'disputed'];
  const isOpenAp = (inv) => OPEN_AP.indexOf(inv.status) !== -1;
  const outstanding = (r) => Math.max(r.amount - r.paid, 0);
  const isOpenAr = (r) => r.status !== 'paid';
  function bucketOf(due) {
    const late = -daysFromToday(due);
    return late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
  }
  const BUCKETS = ['bucketCurrent', 'bucket1', 'bucket2', 'bucket3', 'bucket4'];
  const BUCKET_COLORS = ['#3b8a6c', '#c9a15a', '#c9772f', '#a83a3a', '#5f0e27'];
  const BANK_COLORS = { PNB: '#8A1538', AMIB: '#A9834C', GCB: '#0E7C86', AGTB: '#23395D', INTL: '#5B6B7A' };
  const fyLabel = () => t('fyLabel', { fy: D.fiscalYear });
  function sortList(list, getter, dir) {
    return list.slice().sort((a, b) => {
      const x = getter(a);
      const y = getter(b);
      const order = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return order * dir;
    });
  }

  const AP_STATUS = { pending: ['stPending', 'warn'], approved: ['stApproved', 'info'], scheduled: ['stScheduled', 'maroon'], paid: ['stPaid', 'ok'], hold: ['stHold', 'bad'], disputed: ['stDisputed', 'bad'] };
  const MATCH = { matched: ['matchMatched', 'ok'], price: ['matchPrice', 'warn'], qty: ['matchQty', 'warn'], nopo: ['matchNoPo', 'neutral'] };
  const AR_STATUS = { open: ['arOpen', 'info'], partial: ['arPartial', 'warn'], paid: ['arPaid', 'ok'], dispute: ['arDispute', 'bad'] };
  const RUN_STATUS = { executed: ['runExecuted', 'ok'], awaiting: ['runAwaiting', 'warn'], draft: ['runDraft', 'neutral'] };
  const VENDOR_STATUS = { active: ['vActive', 'ok'], review: ['vReview', 'warn'], blocked: ['vBlocked', 'bad'] };
  const RISK = { low: ['riskLow', 'ok'], medium: ['riskMedium', 'warn'], high: ['riskHigh', 'bad'] };
  const BUDGET_STATUS = { ok: ['budOk', 'ok'], watch: ['budWatch', 'warn'], over: ['budOver', 'bad'] };
  const UTIL_COLORS = { ok: '#12805a', watch: '#c98a1b', over: '#b42318' };
  const OUTCOME = { success: ['outSuccess', 'ok'], denied: ['outDenied', 'bad'] };
  const ROLE = { ccm: 'roleCcm', fc: 'roleFc', cfo: 'roleCfo', ceo: 'roleCeo' };
  const AUDIT_ACTION = { approve: 'aApprove', view: 'aView', create: 'aCreate', release: 'aRelease', post: 'aPost', change: 'aChange', export: 'aExport', update: 'aUpdate', transfer: 'aTransfer', signin: 'aSignin', 'export-denied': 'aExportDenied', reject: 'aReject', hold: 'aHold' };
  const AUDIT_OBJECT = { invoice: 'oInvoice', report: 'oReport', run: 'oRun', vendor: 'oVendor', receivable: 'oReceivable', budget: 'oBudget', session: 'oSession', journal: 'oJournal' };
  const TYPE_ICON = { invoice: 'payables', run: 'runs', budget: 'swap', vendor: 'vendors', journal: 'journal' };
  const TYPE_LABEL = { invoice: 'typeInvoice', run: 'typeRun', budget: 'typeBudget', vendor: 'typeVendor', journal: 'typeJournal' };
  const PO_BOX = { ATH: '22410', ATGH: '24617', ATRE: '31088', ATLG: '40592', ATFM: '52715', ATTR: '61340' };

  /* ---------- Icons and brand artwork ---------- */
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    approvals: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    payables: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    runs: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    receivables: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    treasury: '<path d="M3 21h18M4 10h16M6 10v8M10 10v8M14 10v8M18 10v8"/><path d="M12 3l9 5H3z"/>',
    budget: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    vendors: '<path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    reports: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    audit: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    play: '<path d="M5 3l14 9-14 9z"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    journal: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // Al Thuraya ("the Pleiades"): seven four-point stars in the shape of the cluster.
  const STARS = [[20, 21, 5.4], [29.6, 22.4, 3.2], [32.2, 17.2, 2.3], [16.4, 27.8, 3.3], [10.4, 23.2, 3.5], [13.8, 14.4, 3.3], [21.2, 10.4, 2.7]];
  const sparkle = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
  const STAR_PATH = STARS.map((s) => sparkle(s[0], s[1], s[2])).join('');
  const logoMark = (cls) => `<svg${cls ? ` class="${cls}"` : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="#8A1538"/><path d="${STAR_PATH}" fill="#fff"/></svg>`;
  const starsArt = (cls) => `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true"><path d="${STAR_PATH}" fill="#fff"/></svg>`;
  // The nine white points of the serrated edge, as on the national flag.
  function serration(cls) {
    let d = 'M0 0';
    for (let i = 0; i < 9; i++) d += ` L40 ${(2 * i + 1) * 10} L0 ${(2 * i + 2) * 10}`;
    return `<svg class="${cls}" viewBox="0 0 40 180" preserveAspectRatio="none" aria-hidden="true"><path d="${d} Z" fill="#fff"/></svg>`;
  }

  /* ---------- Small components ---------- */
  const $ = (selector, root) => (root || document).querySelector(selector);
  const pill = (map, key) => {
    const entry = map[key] || [key, 'neutral'];
    return `<span class="pill ${entry[1]}">${T(entry[0])}</span>`;
  };
  const avatar = (person) => `<span class="avatar" aria-hidden="true">${esc(person ? person.initials : '?')}</span>`;
  const personCell = (id) => {
    const p = people[id];
    return p ? `<span class="person">${avatar(p)}<span>${esc(nm(p))}</span></span>` : '—';
  };
  const kpi = (label, value, sub, tone) => `<div class="card kpi${tone ? ' k-' + tone : ''}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div></div>`;
  function card(heading, sub, body, options) {
    const o = options || {};
    return `<section class="card${o.cls ? ' ' + o.cls : ''}"><div class="card-head"><div><h2>${heading}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${o.extra || ''}</div><div class="card-body${o.flush ? ' flush' : ''}">${body}</div></section>`;
  }
  const pageHead = (crumb, heading, sub, actions) => `<div class="page-head"><div><div class="crumbs">${crumb}</div><h1>${heading}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="head-actions">${actions || ''}</div></div>`;
  const asOf = () => `<span class="asof"><span class="live"></span>${T('dataAsOf', { time: fmtTime(state.syncedAt) })}</span>`;
  const exportButton = (what) => `<button class="btn" data-action="export" data-what="${what}">${icon('download')}${T('exportCsv')}</button>`;
  const facts = (rows) => `<dl class="facts">${rows.map((r) => `<div><dt>${T(r[0])}</dt><dd>${r[1]}</dd></div>`).join('')}</dl>`;
  function chips(scope, key, options, active, action) {
    return `<div class="chips" role="tablist">${options.map((o) => `<button class="chip${o.value === active ? ' active' : ''}" role="tab" aria-selected="${o.value === active}" data-action="${action || 'filter'}" data-scope="${scope}" data-key="${key}" data-value="${esc(o.value)}">${o.label}${o.count !== undefined ? `<span class="count">${num(o.count)}</span>` : ''}</button>`).join('')}</div>`;
  }
  function sortHeader(scope, key, label, cls) {
    const s = state[scope];
    const active = s.sort === key;
    const arrow = active ? `<span class="arrow">${s.dir > 0 ? '▲' : '▼'}</span>` : '';
    return `<th class="sortable${cls ? ' ' + cls : ''}" data-action="sort" data-scope="${scope}" data-key="${key}" aria-sort="${active ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${arrow}</th>`;
  }
  function paginate(scope, list, size) {
    const s = state[scope];
    const pages = Math.max(1, Math.ceil(list.length / size));
    if (s.page > pages) s.page = pages;
    if (s.page < 1) s.page = 1;
    const start = (s.page - 1) * size;
    const html = list.length ? `<div class="pager"><span>${T('pageInfo', { from: num(start + 1), to: num(Math.min(start + size, list.length)), total: num(list.length) })}</span><span class="btns"><button class="btn sm" data-action="page" data-scope="${scope}" data-delta="-1"${s.page <= 1 ? ' disabled' : ''}>${T('prev')}</button><button class="btn sm" data-action="page" data-scope="${scope}" data-delta="1"${s.page >= pages ? ' disabled' : ''}>${T('next')}</button></span></div>` : '';
    return { rows: list.slice(start, start + size), html };
  }
  const dueNote = (inv) => {
    if (!isOpenAp(inv)) return '';
    const d = daysFromToday(inv.dueDate);
    if (d < 0) return `<span class="sub" style="color:var(--bad);font-weight:600">${T('overdueBy', { d: -d })}</span>`;
    if (d === 0) return `<span class="sub" style="color:var(--warn);font-weight:600">${T('dueToday')}</span>`;
    if (d <= 7) return `<span class="sub" style="color:var(--warn)">${T('dueIn', { d })}</span>`;
    return '';
  };

  /* ---------- Charts (inline SVG) ---------- */
  function niceMax(v) {
    if (v <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const f = v / exp;
    for (let i = 0; i < steps.length; i++) if (f <= steps[i]) return steps[i] * exp;
    return 10 * exp;
  }
  function revenueChart() {
    const W = 760, H = 260, L = 58, R = 12, TOP = 14, B = 28;
    const actual = new Array(12).fill(null);
    const budget = new Array(12).fill(0);
    scopeEntities().forEach((e) => {
      D.monthly[e.id].forEach((m) => { actual[m.month] = (actual[m.month] || 0) + m.revenue; });
      D.budgetPlan[e.id].forEach((b, i) => { budget[i] += b; });
    });
    const max = niceMax(Math.max.apply(null, budget.concat(actual.filter((v) => v !== null))));
    const cw = (W - L - R) / 12;
    const bw = cw * 0.58;
    const y = (v) => TOP + (H - TOP - B) * (1 - v / max);
    const cx = (i) => (L + i * cw + cw / 2).toFixed(1);
    let s = '';
    for (let k = 0; k <= 4; k++) {
      const v = (max * k) / 4;
      s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis-label" x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisLabel(v))}</text>`;
    }
    actual.forEach((v, i) => {
      if (v === null) return;
      const mtd = i === D.currentPeriod;
      s += `<rect x="${(L + i * cw + (cw - bw) / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" rx="3" fill="${mtd ? 'url(#mtdHatch)' : '#8A1538'}"><title>${esc(monthName(i, 'long'))}${mtd ? ' (MTD)' : ''}: ${esc(money(v, 0))}</title></rect>`;
    });
    s += `<polyline points="${budget.map((v, i) => cx(i) + ',' + y(v).toFixed(1)).join(' ')}" fill="none" stroke="#A9834C" stroke-width="2" stroke-dasharray="5 4"/>`;
    budget.forEach((v, i) => {
      s += `<circle cx="${cx(i)}" cy="${y(v).toFixed(1)}" r="3.2" fill="#fff" stroke="#A9834C" stroke-width="2"><title>${T('legendBudget')} · ${esc(monthName(i, 'long'))}: ${esc(money(v, 0))}</title></circle>`;
    });
    for (let i = 0; i < 12; i++) s += `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle"${i === D.currentPeriod ? ' style="font-weight:700;fill:#8A1538"' : ''}>${esc(monthName(i))}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('chartRevenue')}"><defs><pattern id="mtdHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e3b5c3"/><rect width="3" height="6" fill="#8A1538"/></pattern></defs>${s}</svg>`;
  }
  function donut(segments, centerLabel, centerValue) {
    const total = sum(segments, (seg) => seg.value) || 1;
    const C = 85, R = 80, r = 56;
    const point = (rad, a) => `${(C + rad * Math.cos(a)).toFixed(2)} ${(C + rad * Math.sin(a)).toFixed(2)}`;
    let a0 = -Math.PI / 2;
    let s = '';
    segments.forEach((seg) => {
      const frac = seg.value / total;
      if (frac >= 0.9999) {
        s += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${seg.color}" stroke-width="${R - r}"><title>${esc(seg.title)}</title></circle>`;
        return;
      }
      const a1 = a0 + frac * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      s += `<path d="M ${point(R, a0)} A ${R} ${R} 0 ${large} 1 ${point(R, a1)} L ${point(r, a1)} A ${r} ${r} 0 ${large} 0 ${point(r, a0)} Z" fill="${seg.color}" stroke="#fff" stroke-width="2"><title>${esc(seg.title)}</title></path>`;
      a0 = a1;
    });
    return `<svg class="chart" viewBox="0 0 170 170" role="img" aria-label="${esc(centerLabel)}">${s}<text x="${C}" y="${C - 5}" text-anchor="middle" style="font-size:11px">${esc(centerLabel)}</text><text x="${C}" y="${C + 15}" text-anchor="middle" style="font-size:17px;font-weight:700;fill:#1f1a17">${esc(centerValue)}</text></svg>`;
  }
  function forecastChart() {
    if (!D.forecast.length) return `<div class="empty">${T('noResults')}</div>`;
    const W = 760, H = 250, L = 64, R = 16, TOP = 18, B = 30;
    const points = [{ label: t('todayLabel'), value: D.openingCash, payroll: false }].concat(D.forecast.map((f) => ({ label: fmtShort(f.start), value: f.closing, payroll: f.payroll })));
    const values = points.map((p) => p.value).concat([D.policyMinimum]);
    const step = 50e6;
    const lo = Math.max(0, Math.floor((Math.min.apply(null, values) * 0.92) / step) * step);
    const hi = Math.ceil((Math.max.apply(null, values) * 1.04) / step) * step;
    const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
    const y = (v) => TOP + (H - TOP - B) * (1 - (v - lo) / (hi - lo));
    let s = '';
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4;
      s += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis-label" x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(axisLabel(v))}</text>`;
    }
    const coords = points.map((p, i) => x(i).toFixed(1) + ',' + y(p.value).toFixed(1));
    s += `<path d="M${x(0).toFixed(1)},${y(lo).toFixed(1)} L${coords.join(' L')} L${x(points.length - 1).toFixed(1)},${y(lo).toFixed(1)} Z" fill="url(#fcFill)"/>`;
    const ym = y(D.policyMinimum).toFixed(1);
    s += `<line x1="${L}" x2="${W - R}" y1="${ym}" y2="${ym}" stroke="#B42318" stroke-width="1.4" stroke-dasharray="6 5"/><text x="${W - R}" y="${(y(D.policyMinimum) - 6).toFixed(1)}" text-anchor="end" style="fill:#B42318;font-weight:600">${T('policyMinimum')} · ${esc(axisLabel(D.policyMinimum))}</text>`;
    s += `<polyline points="${coords.join(' ')}" fill="none" stroke="#8A1538" stroke-width="2.4" stroke-linejoin="round"/>`;
    points.forEach((p, i) => {
      s += `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${p.payroll ? 5 : 3.4}" fill="${p.payroll ? '#A9834C' : '#fff'}" stroke="${p.payroll ? '#fff' : '#8A1538'}" stroke-width="2"><title>${esc(p.label)}: ${esc(money(p.value, 0))}${p.payroll ? ' · ' + T('payrollWeek') : ''}</title></circle>`;
      s += `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" style="font-size:10.5px${i === 0 ? ';font-weight:700;fill:#8A1538' : ''}">${esc(p.label)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('forecastTitle')}"><defs><linearGradient id="fcFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8A1538" stop-opacity="0.2"/><stop offset="100%" stop-color="#8A1538" stop-opacity="0.02"/></linearGradient></defs>${s}</svg>`;
  }
  const forecastLegend = () => `<div class="legend"><span><i class="line" style="background:#8A1538"></i>${T('closingBalance')}</span><span><i style="background:#A9834C;border-radius:50%"></i>${T('payrollWeek')}</span><span><i class="line" style="background:#B42318"></i>${T('policyMinimum')}</span></div>`;
  function spark(values, color) {
    if (!values || values.length < 2) return '';
    const w = 96, h = 28;
    const min = Math.min.apply(null, values);
    const span = Math.max.apply(null, values) - min || 1;
    const pts = values.map((v, i) => [((i * (w - 6)) / (values.length - 1) + 3).toFixed(1), (h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)]);
    const last = pts[pts.length - 1];
    return `<svg class="chart spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${color}"/></svg>`;
  }
  function stackBar(values) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    return `<div class="stack-bar">${values.map((v, i) => (v > 0 ? `<span style="width:${((v / total) * 100).toFixed(2)}%;background:${BUCKET_COLORS[i]}" title="${T(BUCKETS[i])}: ${esc(money(v, 0))}"></span>` : '')).join('')}</div>`;
  }
  const agingBlock = (buckets) => stackBar(buckets) + `<div class="stack-legend">${buckets.map((v, i) => `<div style="border-color:${BUCKET_COLORS[i]}"><strong>${esc(compact(v))}</strong><span>${T(BUCKETS[i])}</span></div>`).join('')}</div>`;

  /* ---------- Approvals ---------- */
  function approvalDetail(a) {
    if (a.type === 'invoice') {
      const inv = invoiceById[a.ref];
      const cc = ccById[inv.ccId];
      return { title: latin(vendorById[inv.vendorId].name), meta: `<bdi>${esc(inv.entityId)}</bdi> · <bdi>${esc(cc.id)}</bdi> ${esc(nm(cc))}` };
    }
    if (a.type === 'run') {
      const run = runById[a.ref];
      return { title: T('detailRun', { n: num(run.payments), date: fmtDate(run.date) }), meta: latin(run.channel) };
    }
    if (a.type === 'budget') {
      return { title: Th('detailBudget', { from: `<bdi>${esc(a.from)}</bdi>`, to: `<bdi>${esc(a.to)}</bdi>` }), meta: `${esc(nm(ccById[a.from]))} ${isAr() ? '←' : '→'} ${esc(nm(ccById[a.to]))}` };
    }
    if (a.type === 'vendor') {
      const v = vendorById[a.vendorId];
      return { title: latin(v.name), meta: T('detailVendor', { vendor: v.id }) };
    }
    return { title: T('detailJournal', { p: periodLabel(priorPeriod()) }), meta: T('journalLines') };
  }
  const waitingDays = (a) => Math.max(0, -daysFromToday(a.since));
  function approvalListRow(a) {
    const d = approvalDetail(a);
    const wait = waitingDays(a);
    return `<li class="list-row"><span class="type-icon t-${a.type}">${icon(TYPE_ICON[a.type])}</span><div class="grow"><div class="title">${d.title}</div><div class="meta"><bdi>${esc(a.ref)}</bdi> · ${T(TYPE_LABEL[a.type])}</div></div><div style="text-align:end"><div class="num" style="font-weight:600">${a.amountQar !== null && a.amountQar !== undefined ? esc(compact(a.amountQar)) : '—'}</div><div class="meta"${wait > 2 ? ' style="color:var(--bad);font-weight:600"' : ''}>${T('waitingDays', { d: wait })}</div></div></li>`;
  }
  function review(id) {
    const item = state.approvals.find((a) => a.id === id);
    if (!item) return;
    if (item.type === 'invoice') openInvoice(item.ref);
    else if (item.type === 'run') go('runs');
    else if (item.type === 'vendor') openVendor(item.vendorId);
    else openRequest(item);
  }
  function openRequest(item) {
    const d = approvalDetail(item);
    const rows = [
      ['colType', T(TYPE_LABEL[item.type])],
      ['colReference', `<bdi>${esc(item.ref)}</bdi>`],
      ['colAmount', item.amountQar !== null && item.amountQar !== undefined ? esc(money(item.amountQar)) : '—'],
      ['colRequestedBy', personCell(item.requestedBy)],
      ['colDetails', `${d.title}<div class="small muted" style="font-weight:400">${d.meta}</div>`],
      ['colWaiting', T('waitingDays', { d: waitingDays(item) })]
    ];
    const narrative = item.type === 'budget' ? `<div class="notice info" style="margin-top:16px">${icon('info')}<span>${T('budgetNarrative')}</span></div>` : '';
    openModal({
      title: T(TYPE_LABEL[item.type]) + ' · <bdi>' + esc(item.ref) + '</bdi>',
      body: `<div class="section-title" style="margin-top:0">${T('reqSummary')}</div>${facts(rows)}${narrative}`,
      actions: `<button class="btn" data-action="close-modal">${T('close')}</button><button class="btn danger" data-action="decide" data-decision="reject" data-id="${esc(item.id)}">${T('reject')}</button><button class="btn primary" data-action="decide" data-decision="approve" data-id="${esc(item.id)}">${icon('check')}${T('approve')}</button>`
    });
  }
  function confirmDecision(id, decision) {
    const item = state.approvals.find((a) => a.id === id);
    if (!item) return;
    const reject = decision === 'reject';
    const d = approvalDetail(item);
    openModal({
      title: T(reject ? 'confirmRejectTitle' : 'confirmApproveTitle', { ref: item.ref }),
      body: facts([
        ['colType', T(TYPE_LABEL[item.type])],
        ['colAmount', item.amountQar !== null && item.amountQar !== undefined ? esc(money(item.amountQar)) : '—'],
        ['colDetails', d.title],
        ['colRequestedBy', personCell(item.requestedBy)]
      ]) + `<div class="form-row" style="margin-top:18px"><label for="decisionComment">${T(reject ? 'commentRequired' : 'commentOptional')}</label><textarea id="decisionComment" class="field" maxlength="500"></textarea><div class="form-error" id="decisionError"></div></div>`,
      confirm: {
        label: (reject ? '' : icon('check')) + T(reject ? 'reject' : 'approve'),
        cls: reject ? 'danger' : 'primary',
        run: () => {
          const comment = $('#decisionComment').value.trim();
          if (reject && !comment) {
            $('#decisionError').textContent = t('commentRequired');
            return false;
          }
          return decide(item, decision, comment);
        }
      }
    });
  }
  // The server records the decision (and, for payment runs, the treasury service); the UI merges what changed.
  async function decide(item, decision, comment) {
    const result = await api(`api/approvals/${encodeURIComponent(item.id)}/decision`, { decision, comment });
    if (!result) return false;
    state.approvals = state.approvals.filter((a) => a.id !== item.id);
    if (result.invoice && invoiceById[result.invoice.id]) Object.assign(invoiceById[result.invoice.id], result.invoice);
    if (result.vendor && vendorById[result.vendor.id]) vendorById[result.vendor.id].status = result.vendor.status;
    if (result.run && runById[result.run.id]) {
      Object.assign(runById[result.run.id], result.run);
      if (result.run.decision) state.runDecision = result.run.decision;
    }
    if (result.transfer) upsertTransfer(result.transfer);
    if (result.audit) addAudit(result.audit);
    if (decision === 'approve') {
      if (item.type === 'invoice') {
        const next = invoiceById[item.ref].chain.find((s) => s.status === 'current');
        toast(next ? t('approvedRouted', { ref: item.ref, name: nm(people[next.approver]) }) : t('approvedFinal', { ref: item.ref }));
      } else if (item.type === 'run') {
        toast(t('approvedRun', { ref: item.ref, name: nm(D.people.treasury) }));
      } else if (item.type === 'vendor') {
        toast(t('vendorApproved', { vendor: isolate(vendorById[item.vendorId].name) }));
      } else {
        toast(t('approvedGeneric', { ref: item.ref }));
      }
    } else {
      toast(t('rejectedMsg', { ref: item.ref, name: nm(people[item.requestedBy]) }));
    }
    closeDrawer(true);
    renderRoute();
    return true;
  }
  function addAudit(entry) {
    state.audits.unshift(entry);
  }
  // Browser-side activity (sign-in, document views, exports) is shown at once and saved to the audit trail.
  function recordActivity(action, object, ref) {
    const entry = { at: new Date().toISOString(), user: persona.id, action, object, ref, ip: personaIp, outcome: 'success' };
    addAudit(entry);
    api('api/audit', { action, object, ref }).then((saved) => {
      if (saved && saved.at) entry.at = saved.at;
    });
  }

  /* ---------- Views ---------- */
  function viewDashboard() {
    const entities = scopeEntities();
    let revenue = 0;
    let budget = 0;
    let ebitda = 0;
    entities.forEach((e) => D.monthly[e.id].forEach((m) => { revenue += m.revenue; budget += m.budgetRevenue; ebitda += m.ebitda; }));
    const accounts = D.accounts.filter((a) => inScope(a.entity));
    const cash = sum(accounts, (a) => a.balanceQar);
    const banks = Array.from(new Set(accounts.map((a) => a.bank)));
    const openAp = D.invoices.filter((i) => inScope(i.entityId) && isOpenAp(i));
    const due7 = openAp.filter((i) => {
      const d = daysFromToday(i.dueDate);
      return d >= 0 && d <= 7 && i.status !== 'hold' && i.status !== 'disputed';
    });
    const openAr = D.receivables.filter((r) => inScope(r.entityId) && isOpenAr(r));
    const arTotal = sum(openAr, outstanding);
    const arOverdue = sum(openAr.filter((r) => daysFromToday(r.dueDate) < 0), outstanding);
    const oldest = state.approvals.length ? Math.max.apply(null, state.approvals.map(waitingDays)) : 0;
    const vsBudget = budget ? revenue / budget - 1 : 0;
    const hour = new Date().getHours();
    const greeting = t(hour < 12 ? 'greetMorning' : hour < 17 ? 'greetAfternoon' : 'greetEvening');
    const sub = state.entity === 'ALL' ? T('dashSubtitle', { n: D.entities.length, fy: D.fiscalYear }) : esc(nm(entityById[state.entity]) + ' · ' + fyLabel());

    const kpis = `<div class="grid kpis kpis-6">${[
      kpi(T('kpiRevenue'), esc(compact(revenue)), Th('kpiVsBudget', { pct: `<span class="delta ${vsBudget >= 0 ? 'up' : 'down'}">${esc(signedPct(vsBudget))}</span>` })),
      kpi(T('kpiEbitda'), esc(compact(ebitda)), T('kpiMargin', { pct: pct(revenue ? ebitda / revenue : 0) }), 'gold'),
      kpi(T('kpiCash'), esc(compact(cash)), T('kpiCashSub', { n: accounts.length, b: banks.length }), 'ok'),
      kpi(T('kpiDue7'), esc(compact(sum(due7, (i) => i.amountQar))), T('kpiInvoices', { n: due7.length })),
      kpi(T('kpiOverdueAr'), esc(compact(arOverdue)), T('kpiOfAr', { pct: pct(arTotal ? arOverdue / arTotal : 0) }), 'warn'),
      kpi(T('kpiApprovals'), esc(num(state.approvals.length)), state.approvals.length ? T('kpiOldest', { d: oldest }) : T('noApprovals'), oldest > 2 ? 'bad' : '')
    ].join('')}</div>`;

    const bankTotals = banks.map((id) => ({ id, value: sum(accounts.filter((a) => a.bank === id), (a) => a.balanceQar) })).sort((a, b) => b.value - a.value);
    const cashMix = `<div class="donut-wrap">${donut(bankTotals.map((b) => ({ value: b.value, color: BANK_COLORS[b.id], title: nm(bankById[b.id]) + ': ' + money(b.value, 0) })), currencyLabel('QAR'), shortAmount(cash))}<ul class="key-list">${bankTotals.map((b) => `<li><span><span class="dot" style="background:${BANK_COLORS[b.id]}"></span>${esc(nm(bankById[b.id]))}</span><span class="num">${esc(shortAmount(b.value))} <span class="muted small">${esc(pct(b.value / (cash || 1), 0))}</span></span></li>`).join('')}</ul></div>`;

    const entityRows = entities.map((e) => {
      const months = D.monthly[e.id];
      const rev = sum(months, (m) => m.revenue);
      const bud = sum(months, (m) => m.budgetRevenue);
      const eb = sum(months, (m) => m.ebitda);
      const variance = bud ? rev / bud - 1 : 0;
      return `<tr><td><span class="primary-text"><span class="entity-dot" style="background:${e.color}"></span>${esc(nm(e))}</span><span class="sub">${esc(isAr() ? e.segmentAr : e.segment)} · ${esc(e.id)}</span></td><td class="num">${esc(compact(rev))}</td><td class="num"><span class="delta ${variance >= 0 ? 'up' : 'down'}">${esc(signedPct(variance))}</span></td><td class="num">${esc(pct(rev ? eb / rev : 0))}</td><td class="num">${T('daysUnit', { d: e.dso })}</td><td>${spark(months.filter((m) => !m.mtd).map((m) => m.revenue), e.color)}</td></tr>`;
    }).join('');
    const entityTable = `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colEntity')}</th><th class="num">${T('colRevenueYtd')}</th><th class="num">${T('colVsBudget')}</th><th class="num">${T('colEbitdaMargin')}</th><th class="num">${T('colDso')}</th><th>${T('colTrend')}</th></tr></thead><tbody>${entityRows}</tbody></table></div>`;
    const preview = state.approvals.slice(0, 5).map(approvalListRow).join('') || `<li class="empty">${T('noApprovals')}</li>`;
    const activity = state.audits.slice(0, 7).map((a) => `<li class="list-row"><div class="grow activity"><div class="title" style="font-weight:500">${auditSentence(a)}</div><div class="meta">${esc(relTime(a.at))} · <span class="ltr">${esc(a.ip)}</span></div></div></li>`).join('');

    return pageHead(T('navOverview'), `${esc(greeting)}, ${esc(nm(persona).split(' ')[0])}`, sub, `${asOf()}<button class="btn" data-action="refresh">${icon('refresh')}${T('refresh')}</button>`) +
      kpis +
      `<div class="grid cols-2-1">${card(T('chartRevenue'), T('chartRevenueSub'), revenueChart(), { extra: `<div class="legend"><span><i style="background:#8A1538"></i>${T('legendActual')}</span><span><i class="line" style="background:#A9834C"></i>${T('legendBudget')}</span></div>` })}${card(T('chartCashMix'), T('chartCashMixSub'), cashMix)}</div>` +
      `<div class="grid cols-2-1 mt">${card(T('entityPerformance'), esc(fyLabel()), entityTable, { flush: true })}${card(T('approvalsPreview'), T('kpiApprovals'), `<ul class="list">${preview}</ul>`, { flush: true, extra: `<a class="btn sm" href="#/approvals">${T('viewAll')}</a>` })}</div>` +
      `<div class="grid cols-2-1 mt">${card(T('forecastTitle'), T('forecastSub', { min: compact(D.policyMinimum) }), forecastChart(), { extra: forecastLegend() })}${card(T('recentActivity'), '', `<ul class="list">${activity}</ul>`, { flush: true, extra: `<a class="btn sm" href="#/audit">${T('viewAll')}</a>` })}</div>`;
  }
  function auditSentence(a) {
    if (a.action === 'signin') return `<strong>${esc(nm(people[a.user]))}</strong> · ${T('aSignin')}`;
    return `<strong>${esc(nm(people[a.user]))}</strong> · ${T(AUDIT_ACTION[a.action] || a.action)} · ${T(AUDIT_OBJECT[a.object] || a.object)} <bdi>${esc(a.ref)}</bdi>`;
  }

  function viewApprovals() {
    const tabs = [['all', 'tabAll'], ['invoice', 'tabInvoices'], ['run', 'tabRuns'], ['budget', 'tabBudget'], ['vendor', 'tabVendor'], ['journal', 'tabJournal']];
    const counts = { all: state.approvals.length };
    state.approvals.forEach((a) => { counts[a.type] = (counts[a.type] || 0) + 1; });
    const list = state.approvals.filter((a) => state.approvalTab === 'all' || a.type === state.approvalTab);
    const rows = list.map((a) => {
      const d = approvalDetail(a);
      const wait = waitingDays(a);
      return `<tr><td><span class="person"><span class="type-icon t-${a.type}">${icon(TYPE_ICON[a.type])}</span><span>${T(TYPE_LABEL[a.type])}</span></span></td><td class="nowrap"><a href="#" class="primary-text" data-action="review" data-id="${esc(a.id)}"><bdi>${esc(a.ref)}</bdi></a></td><td><span class="primary-text">${d.title}</span><span class="sub">${d.meta}</span></td><td class="num">${a.amountQar !== null && a.amountQar !== undefined ? esc(money(a.amountQar)) : '—'}</td><td>${personCell(a.requestedBy)}</td><td><span class="pill ${wait > 2 ? 'bad' : 'neutral'}">${T('waitingDays', { d: wait })}</span></td><td class="nowrap" style="text-align:end"><button class="btn sm" data-action="review" data-id="${esc(a.id)}">${T('review')}</button> <button class="btn sm danger" data-action="decide" data-decision="reject" data-id="${esc(a.id)}">${T('reject')}</button> <button class="btn sm primary" data-action="decide" data-decision="approve" data-id="${esc(a.id)}">${T('approve')}</button></td></tr>`;
    }).join('');
    const table = list.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colType')}</th><th>${T('colReference')}</th><th>${T('colDetails')}</th><th class="num">${T('colAmount')}</th><th>${T('colRequestedBy')}</th><th>${T('colWaiting')}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${T('noApprovals')}</div>`;
    return pageHead(T('navOverview'), T('approvalsTitle'), T('approvalsSub'), asOf()) +
      `<div class="notice maroon" style="margin-bottom:16px">${icon('info')}<span>${T('doaNote')}</span></div>` +
      `<section class="card"><div class="toolbar">${chips('approvals', 'tab', tabs.map((tab) => ({ value: tab[0], label: T(tab[1]), count: counts[tab[0]] || 0 })), state.approvalTab, 'approval-tab')}</div>${table}</section>`;
  }

  function payablesList() {
    const f = state.ap;
    const q = f.q.trim().toLowerCase();
    let list = D.invoices.filter((i) => inScope(i.entityId));
    if (f.status === 'open') list = list.filter(isOpenAp);
    else if (f.status !== 'all') list = list.filter((i) => i.status === f.status);
    if (f.category !== 'all') list = list.filter((i) => i.category === f.category);
    if (q) list = list.filter((i) => [i.id, i.vendorRef, i.poNumber || '', vendorById[i.vendorId].name].join(' ').toLowerCase().indexOf(q) !== -1);
    const getters = { id: (i) => i.id, vendor: (i) => vendorById[i.vendorId].name, entity: (i) => i.entityId, invoiceDate: (i) => i.invoiceDate, dueDate: (i) => i.dueDate, amount: (i) => i.amountQar, status: (i) => i.status };
    return sortList(list, getters[f.sort] || getters.dueDate, f.dir);
  }
  function tablePayables() {
    const list = payablesList();
    if (!list.length) return `<div class="empty">${T('noResults')}</div>`;
    const page = paginate('ap', list, 20);
    const rows = page.rows.map((inv) => {
      const v = vendorById[inv.vendorId];
      return `<tr class="clickable" data-action="open-invoice" data-id="${esc(inv.id)}"><td><span class="primary-text">${esc(inv.id)}</span><span class="sub">${esc(inv.vendorRef)}</span></td><td><span class="primary-text">${latin(v.name)}</span><span class="sub">${esc(nm(D.categories[inv.category]))}</span></td><td><span class="tag">${esc(inv.entityId)}</span></td><td class="nowrap">${esc(fmtDate(inv.invoiceDate))}</td><td class="nowrap">${esc(fmtDate(inv.dueDate))}${dueNote(inv)}</td><td class="num"><span class="primary-text">${esc(money(inv.amountQar))}</span>${inv.currency !== 'QAR' ? `<span class="sub">${esc(money(inv.amount, 2, inv.currency))}</span>` : ''}</td><td>${pill(MATCH, inv.match)}</td><td>${pill(AP_STATUS, inv.status)}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data"><thead><tr>${sortHeader('ap', 'id', T('colInvoice'))}${sortHeader('ap', 'vendor', T('colVendor'))}${sortHeader('ap', 'entity', T('colEntity'))}${sortHeader('ap', 'invoiceDate', T('colInvoiceDate'))}${sortHeader('ap', 'dueDate', T('colDueDate'))}${sortHeader('ap', 'amount', T('colAmount'), 'num')}<th>${T('colMatch')}</th>${sortHeader('ap', 'status', T('colStatus'))}</tr></thead><tbody>${rows}</tbody></table></div>${page.html}`;
  }
  function viewPayables() {
    const scoped = D.invoices.filter((i) => inScope(i.entityId));
    const open = scoped.filter(isOpenAp);
    const overdue = open.filter((i) => daysFromToday(i.dueDate) < 0);
    const dueWeek = open.filter((i) => { const d = daysFromToday(i.dueDate); return d >= 0 && d <= 7 && i.status !== 'hold' && i.status !== 'disputed'; });
    const held = open.filter((i) => i.status === 'hold' || i.status === 'disputed');
    const buckets = [0, 0, 0, 0, 0];
    open.forEach((i) => { buckets[bucketOf(i.dueDate)] += i.amountQar; });
    const counts = {};
    scoped.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
    const statusOptions = [['open', 'fOpen', open.length], ['pending', 'fPending'], ['approved', 'fApproved'], ['scheduled', 'fScheduled'], ['hold', 'fHold'], ['disputed', 'fDisputed'], ['paid', 'fPaid'], ['all', 'fAll', scoped.length]]
      .map((o) => ({ value: o[0], label: T(o[1]), count: o[2] !== undefined ? o[2] : counts[o[0]] || 0 }));
    const categories = Object.keys(D.categories).map((k) => `<option value="${k}"${state.ap.category === k ? ' selected' : ''}>${esc(nm(D.categories[k]))}</option>`).join('');
    const total = (list) => esc(compact(sum(list, (i) => i.amountQar)));
    return pageHead(T('navOperations'), T('apTitle'), T('apSub'), asOf() + exportButton('ap')) +
      `<div class="grid kpis kpis-4">${kpi(T('kpiOpenAp'), total(open), T('kpiInvoices', { n: open.length }))}${kpi(T('kpiOverdueAp'), total(overdue), T('kpiInvoices', { n: overdue.length }), 'bad')}${kpi(T('kpiDueWeek'), total(dueWeek), T('kpiInvoices', { n: dueWeek.length }), 'gold')}${kpi(T('kpiOnHold'), total(held), T('kpiInvoices', { n: held.length }), 'warn')}</div>` +
      card(T('agingTitle'), T('agingSub'), agingBlock(buckets)) +
      `<section class="card mt"><div class="toolbar">${chips('ap', 'status', statusOptions, state.ap.status)}<select class="field" data-input="ap" data-key="category" aria-label="${T('colCategory')}"><option value="all">${T('categoryAll')}</option>${categories}</select><input class="field grow" type="search" data-input="ap" data-key="q" value="${esc(state.ap.q)}" placeholder="${T('filterPlaceholder')}" aria-label="${T('filterPlaceholder')}"></div><div id="tableHost">${tablePayables()}</div></section>`;
  }

  function stepHtml(s) {
    const cls = s.state || '';
    const mark = cls === 'done' ? icon('check') : cls === 'rejected' ? icon('x') : '';
    return `<div class="step ${cls}"><span class="step-dot">${mark}</span><div><div class="who">${esc(nm(s.who))}${s.who && s.who.id === persona.id ? ` <span class="pill maroon">${T('youLabel')}</span>` : ''}</div><div class="role">${esc(s.role)}</div><div class="when">${esc(s.when)}</div></div></div>`;
  }
  function viewRuns() {
    const awaiting = D.paymentRuns.find((r) => r.status === 'awaiting');
    if (!awaiting) return pageHead(T('navOperations'), T('runsTitle'), T('runsSub'), asOf()) + `<section class="card"><div class="empty">${T('noAwaitingRun')}</div></section>`;
    const items = D.invoices.filter((i) => i.paymentRun === awaiting.id).sort((a, b) => b.amountQar - a.amountQar);
    const approval = state.approvals.find((a) => a.type === 'run');
    const decision = state.runDecision;
    const approved = decision && decision.decision === 'approve';
    const rejected = decision && decision.decision === 'reject';
    const steps = [
      { state: 'done', who: D.people.ap, role: t('preparedBy'), when: t('stepDone', { date: fmtDateTime(awaiting.createdAt) }) },
      {
        state: approved ? 'done' : rejected ? 'rejected' : 'current',
        who: persona,
        role: t('firstApproval'),
        when: decision ? t(approved ? 'stepDone' : 'stepRejected', { date: fmtDateTime(decision.at) }) : t('stepCurrent', { date: fmtDate(approval ? approval.since : D.today) })
      },
      { state: approved ? 'current' : '', who: D.people.treasury, role: t('secondApproval'), when: approved ? t('awaitingReleaseBy', { name: nm(D.people.treasury) }) : t('stepWaiting') }
    ];
    let actionArea = '';
    if (approval) {
      actionArea = `<div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-action="decide" data-decision="approve" data-id="${esc(approval.id)}">${icon('check')}${T('approveRelease')}</button><button class="btn danger" data-action="decide" data-decision="reject" data-id="${esc(approval.id)}">${T('reject')}</button></div>`;
    } else if (approved) {
      actionArea = `<div class="notice info" style="margin-top:18px">${icon('info')}<span>${T('awaitingReleaseBy', { name: nm(D.people.treasury) })}</span></div>`;
    } else if (rejected) {
      actionArea = `<div class="notice bad" style="margin-top:18px">${icon('alert')}<span>${T('runRejected', { name: nm(D.people.ap) })}</span></div>`;
    }
    const runCard = `<section class="card run-card"><div class="run-main"><div class="small muted" style="font-weight:600">${T('nextRun')}</div><h3 style="display:flex;gap:10px;align-items:center;margin-top:4px"><bdi>${esc(awaiting.id)}</bdi>${pill(RUN_STATUS, 'awaiting')}</h3><div class="run-amount">${esc(money(awaiting.amountQar))}</div>${facts([
      ['colValueDate', esc(fmtDate(awaiting.date))],
      ['paymentsCount', esc(num(awaiting.payments))],
      ['colChannel', latin(awaiting.channel)],
      ['bankFile', `<span class="mono ltr">${esc(awaiting.file)}</span>`]
    ])}${actionArea}</div><div class="steps">${steps.map(stepHtml).join('')}</div></section>`;
    const paymentRows = items.slice(0, 10).map((i) => `<tr class="clickable" data-action="open-invoice" data-id="${esc(i.id)}"><td><span class="primary-text">${latin(vendorById[i.vendorId].name)}</span><span class="sub">${esc(i.id)} · ${esc(i.entityId)}</span></td><td class="nowrap">${esc(fmtDate(i.dueDate))}</td><td class="num">${esc(money(i.amountQar))}</td></tr>`).join('');
    const more = items.length > 10 ? `<div class="pager"><span>${T('moreItems', { n: num(items.length - 10) })}</span></div>` : '';
    const history = D.paymentRuns.slice().reverse().map((r) => `<tr><td class="primary-text"><bdi>${esc(r.id)}</bdi></td><td class="nowrap">${esc(fmtDate(r.date))}</td><td class="num">${esc(num(r.payments))}</td><td class="num">${esc(money(r.amountQar))}</td><td>${latin(r.channel)}</td><td><span class="mono small ltr">${esc(r.file)}</span></td><td>${r.approvedBy ? personCell(r.approvedBy) : '—'}</td><td>${pill(RUN_STATUS, r.status)}</td></tr>`).join('');
    return pageHead(T('navOperations'), T('runsTitle'), T('runsSub'), asOf() + exportButton('runs')) + runCard +
      `<div class="mt">${card(T('runPayments'), `<bdi>${esc(awaiting.id)}</bdi> · ${T('kpiInvoices', { n: num(items.length) })}`, `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colVendor')}</th><th>${T('colDueDate')}</th><th class="num">${T('colAmount')}</th></tr></thead><tbody>${paymentRows}</tbody></table></div>${more}`, { flush: true })}</div>` +
      `<div class="mt">${card(T('runHistory'), '', `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colRun')}</th><th>${T('colValueDate')}</th><th class="num">${T('colPayments')}</th><th class="num">${T('colTotal')}</th><th>${T('colChannel')}</th><th>${T('bankFile')}</th><th>${T('secondApproval')}</th><th>${T('colStatus')}</th></tr></thead><tbody>${history}</tbody></table></div>`, { flush: true })}</div>`;
  }

  function viewTreasury() {
    const accounts = D.accounts.filter((a) => inScope(a.entity));
    const total = sum(accounts, (a) => a.balanceQar);
    const deposits = accounts.filter((a) => a.rate);
    const depositTotal = sum(deposits, (a) => a.balanceQar);
    const avgRate = depositTotal ? sum(deposits, (a) => a.rate * a.balanceQar) / depositTotal / 100 : 0;
    const lowest = D.forecast.length ? D.forecast.reduce((m, f) => (f.closing < m.closing ? f : m), D.forecast[0]) : null;
    const payroll = D.forecast.find((f) => f.payroll);
    const accountRows = accounts.map((a) => `<tr><td class="nowrap"><span class="primary-text">${esc(nm(bankById[a.bank]))}</span><span class="sub">${esc(a.bank)}</span></td><td><span class="tag">${esc(a.entity)}</span></td><td>${esc(nm(a))}</td><td class="nowrap"><span class="mono small ltr">${esc(a.iban)}</span></td><td>${esc(a.currency)}</td><td class="num">${esc(money(a.balance, 2, a.currency))}</td><td class="num">${esc(money(a.balanceQar))}</td><td class="nowrap">${esc(fmtDate(a.statement))}</td><td>${spark(a.trend, BANK_COLORS[a.bank])}</td></tr>`).join('');
    const banks = Array.from(new Set(accounts.map((a) => a.bank))).map((id) => ({ id, value: sum(accounts.filter((a) => a.bank === id), (a) => a.balanceQar) })).sort((a, b) => b.value - a.value);
    const maxBank = banks.length ? banks[0].value : 1;
    const bankBars = banks.map((b) => `<div class="hbar"><span>${esc(nm(bankById[b.id]))}</span><span class="track"><span style="width:${((b.value / maxBank) * 100).toFixed(1)}%;background:${BANK_COLORS[b.id]}"></span></span><span class="num">${esc(compact(b.value))}</span></div>`).join('') || `<div class="empty">${T('noResults')}</div>`;
    const maturities = deposits.map((a) => `<li class="list-row"><span class="type-icon t-budget">${icon('lock')}</span><div class="grow"><div class="title">${esc(nm(a))}</div><div class="meta">${esc(nm(bankById[a.bank]))} · ${T('colRate')} ${esc(pct(a.rate / 100, 2))}</div></div><div style="text-align:end"><div class="num" style="font-weight:600">${esc(compact(a.balanceQar))}</div><div class="meta">${esc(fmtDate(a.maturity))} · ${T('dueIn', { d: daysFromToday(a.maturity) })}</div></div></li>`).join('') || `<li class="empty">${T('noResults')}</li>`;
    const forecastRows = D.forecast.map((f) => `<tr><td>${T('weekShort', { n: f.week })}</td><td class="nowrap">${esc(fmtDate(f.start))}${f.payroll ? ` <span class="pill warn">${T('payrollWeek')}</span>` : ''}</td><td class="num">${esc(compact(f.inflow))}</td><td class="num">${esc(compact(f.outflow))}</td><td class="num"><strong${f.closing < D.policyMinimum ? ' style="color:var(--bad)"' : ''}>${esc(compact(f.closing))}</strong></td></tr>`).join('');
    return pageHead(T('navTreasuryGroup'), T('treasuryTitle'), T('treasurySub'), asOf() + exportButton('accounts')) +
      `<div class="grid kpis kpis-4">${kpi(T('kpiTotalCash'), esc(compact(total)), T('kpiCashSub', { n: accounts.length, b: banks.length }), 'ok')}${kpi(T('kpiDeposits'), esc(compact(depositTotal)), depositTotal ? T('kpiAvgRate', { rate: pct(avgRate, 2) }) : '—', 'gold')}${lowest ? kpi(T('kpiLowest'), esc(compact(lowest.closing)), lowest.closing < D.policyMinimum ? `<span class="pill bad">${T('belowMinimum')}</span>` : T('kpiLowestSub', { w: lowest.week, date: fmtShort(lowest.start) }), lowest.closing < D.policyMinimum ? 'bad' : '') : kpi(T('kpiLowest'), '—', '')}${kpi(T('kpiPayroll'), esc(payroll ? fmtDate(payroll.start) : '—'), esc(compact(48.6e6)) + ' · WPS', 'warn')}</div>` +
      card(T('accountsTitle'), T('treasurySub'), `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colBank')}</th><th>${T('colEntity')}</th><th>${T('colAccount')}</th><th>${T('colIban')}</th><th>${T('colCurrency')}</th><th class="num">${T('colBalance')}</th><th class="num">${T('colQarEquivalent')}</th><th>${T('colStatementDate')}</th><th>${T('colTrend')}</th></tr></thead><tbody>${accountRows}</tbody><tfoot><tr><td colspan="6">${T('colTotal')}</td><td class="num">${esc(money(total))}</td><td colspan="2"></td></tr></tfoot></table></div>`, { flush: true }) +
      `<div class="grid cols-1-1 mt">${card(T('byBank'), T('chartCashMixSub'), bankBars)}${card(T('maturities'), '', `<ul class="list">${maturities}</ul>`, { flush: true })}</div>` +
      `<div class="grid cols-2-1 mt">${card(T('forecastTitle'), T('forecastSub', { min: compact(D.policyMinimum) }), forecastChart(), { extra: forecastLegend() })}${card(T('forecastTable'), '', `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colWeek')}</th><th>${T('colWeekStart')}</th><th class="num">${T('inflows')}</th><th class="num">${T('outflows')}</th><th class="num">${T('closingBalance')}</th></tr></thead><tbody>${forecastRows}</tbody></table></div>`, { flush: true })}</div>`;
  }

  function receivablesList() {
    const f = state.ar;
    const q = f.q.trim().toLowerCase();
    let list = D.receivables.filter((r) => inScope(r.entityId));
    if (f.status === 'open') list = list.filter(isOpenAr);
    else if (f.status !== 'all') list = list.filter((r) => r.status === f.status);
    if (q) list = list.filter((r) => [r.id, r.reference, customerById[r.customerId].name].join(' ').toLowerCase().indexOf(q) !== -1);
    const getters = { id: (r) => r.id, customer: (r) => customerById[r.customerId].name, entity: (r) => r.entityId, issueDate: (r) => r.issueDate, dueDate: (r) => r.dueDate, amount: (r) => r.amount, outstanding, status: (r) => r.status };
    return sortList(list, getters[f.sort] || getters.dueDate, f.dir);
  }
  function tableReceivables() {
    const list = receivablesList();
    if (!list.length) return `<div class="empty">${T('noResults')}</div>`;
    const page = paginate('ar', list, 20);
    const rows = page.rows.map((r) => {
      const late = -daysFromToday(r.dueDate);
      const note = isOpenAr(r) && late > 0 ? `<span class="sub" style="color:var(--bad);font-weight:600">${T('overdueBy', { d: late })}</span>` : '';
      return `<tr><td><span class="primary-text">${esc(r.id)}</span><span class="sub">${esc(r.reference)}</span></td><td><span class="primary-text">${latin(customerById[r.customerId].name)}</span><span class="sub">${esc(customerById[r.customerId].segment)}</span></td><td><span class="tag">${esc(r.entityId)}</span></td><td class="nowrap">${esc(fmtDate(r.issueDate))}</td><td class="nowrap">${esc(fmtDate(r.dueDate))}${note}</td><td class="num">${esc(money(r.amount))}</td><td class="num"><strong>${esc(money(outstanding(r)))}</strong></td><td>${pill(AR_STATUS, r.status)}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data"><thead><tr>${sortHeader('ar', 'id', T('colDocument'))}${sortHeader('ar', 'customer', T('colCustomer'))}${sortHeader('ar', 'entity', T('colEntity'))}${sortHeader('ar', 'issueDate', T('colIssueDate'))}${sortHeader('ar', 'dueDate', T('colDueDate'))}${sortHeader('ar', 'amount', T('colAmount'), 'num')}${sortHeader('ar', 'outstanding', T('colOutstanding'), 'num')}${sortHeader('ar', 'status', T('colStatus'))}</tr></thead><tbody>${rows}</tbody></table></div>${page.html}`;
  }
  function viewReceivables() {
    const scoped = D.receivables.filter((r) => inScope(r.entityId));
    const open = scoped.filter(isOpenAr);
    const total = sum(open, outstanding);
    const overdueList = open.filter((r) => daysFromToday(r.dueDate) < 0);
    const overdue = sum(overdueList, outstanding);
    const dispute = open.filter((r) => r.status === 'dispute');
    const entities = scopeEntities();
    const weights = entities.map((e) => ({ dso: e.dso, w: sum(open.filter((r) => r.entityId === e.id), outstanding) }));
    const weightTotal = sum(weights, (x) => x.w);
    const dso = weightTotal ? Math.round(sum(weights, (x) => x.dso * x.w) / weightTotal) : Math.round(sum(entities, (e) => e.dso) / entities.length);
    const agingRows = entities.map((e) => {
      const b = [0, 0, 0, 0, 0];
      open.filter((r) => r.entityId === e.id).forEach((r) => { b[bucketOf(r.dueDate)] += outstanding(r); });
      const entityTotal = b.reduce((x, y) => x + y, 0);
      return entityTotal ? `<div class="hbar"><span>${esc(nm(e))}</span>${stackBar(b)}<span class="num">${esc(compact(entityTotal))}</span></div>` : '';
    }).join('');
    const legend = `<div class="legend" style="margin-top:12px">${BUCKETS.map((k, i) => `<span><i style="background:${BUCKET_COLORS[i]}"></i>${T(k)}</span>`).join('')}</div>`;
    const byCustomer = {};
    overdueList.forEach((r) => {
      const c = byCustomer[r.customerId] || (byCustomer[r.customerId] = { amount: 0, oldest: 0 });
      c.amount += outstanding(r);
      c.oldest = Math.max(c.oldest, -daysFromToday(r.dueDate));
    });
    const top = Object.keys(byCustomer).map((id) => Object.assign({ id }, byCustomer[id])).sort((a, b) => b.amount - a.amount).slice(0, 7);
    const topRows = top.map((c) => `<tr><td><span class="primary-text">${latin(customerById[c.id].name)}</span><span class="sub">${esc(customerById[c.id].entity)} · ${T('colCreditLimit')} ${esc(compact(customerById[c.id].limit))}</span></td><td class="num"><strong>${esc(compact(c.amount))}</strong></td><td class="num"><span class="pill ${c.oldest > 60 ? 'bad' : 'warn'}">${T('daysUnit', { d: c.oldest })}</span></td></tr>`).join('');
    const counts = {};
    scoped.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const statusOptions = [['open', 'arOpen', open.length], ['partial', 'arPartial'], ['dispute', 'arDispute'], ['paid', 'arPaid'], ['all', 'fAll', scoped.length]]
      .map((o) => ({ value: o[0], label: T(o[1]), count: o[2] !== undefined ? o[2] : counts[o[0]] || 0 }));
    return pageHead(T('navOperations'), T('arTitle'), T('arSub'), asOf() + exportButton('ar')) +
      `<div class="grid kpis kpis-4">${kpi(T('kpiOpenAr'), esc(compact(total)), T('kpiInvoices', { n: open.length }))}${kpi(T('kpiOverdueAr2'), esc(compact(overdue)), T('kpiOfAr', { pct: pct(total ? overdue / total : 0) }), 'warn')}${kpi(T('kpiDsoLabel'), T('daysUnit', { d: dso }), esc(fyLabel()), 'gold')}${kpi(T('kpiDispute'), esc(compact(sum(dispute, outstanding))), T('kpiInvoices', { n: dispute.length }), 'bad')}</div>` +
      `<div class="grid cols-2-1">${card(T('agingByEntity'), T('agingSub'), (agingRows || `<div class="empty">${T('noResults')}</div>`) + legend)}${card(T('topOverdue'), '', `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colCustomer')}</th><th class="num">${T('colOverdue')}</th><th class="num">${T('colOldest')}</th></tr></thead><tbody>${topRows || `<tr><td colspan="3" class="empty">${T('noResults')}</td></tr>`}</tbody></table></div>`, { flush: true })}</div>` +
      `<section class="card mt"><div class="toolbar">${chips('ar', 'status', statusOptions, state.ar.status)}<input class="field grow" type="search" data-input="ar" data-key="q" value="${esc(state.ar.q)}" placeholder="${T('filterPlaceholder')}" aria-label="${T('filterPlaceholder')}"></div><div id="tableHost">${tableReceivables()}</div></section>`;
  }

  const budgetStatus = (util) => (util > 1 ? 'over' : util >= 0.95 ? 'watch' : 'ok');
  function viewBudget() {
    const centres = D.costCentres.filter((c) => inScope(c.entity));
    const annual = sum(centres, (c) => c.budget);
    const ytdBudget = sum(centres, (c) => c.budgetYtd);
    const actual = sum(centres, (c) => c.actualYtd);
    const committed = sum(centres, (c) => c.committed);
    const forecast = sum(centres, (c) => c.forecast);
    const rows = centres.map((c) => {
      const util = c.budgetYtd ? c.actualYtd / c.budgetYtd : 0;
      const st = budgetStatus(util);
      const available = c.budget - c.actualYtd - c.committed;
      return `<tr><td><span class="primary-text"><bdi>${esc(c.id)}</bdi> · ${esc(nm(c))}</span></td><td><span class="tag">${esc(c.entity)}</span></td><td>${personCell(c.manager.id)}</td><td class="num">${esc(compact(c.budget))}</td><td class="num">${esc(compact(c.budgetYtd))}</td><td class="num">${esc(compact(c.actualYtd))}</td><td class="num">${esc(compact(c.committed))}</td><td class="num"${available < 0 ? ' style="color:var(--bad)"' : ''}>${esc(compact(available))}</td><td><div class="util"><div class="track"><span style="width:${((Math.min(util, 1.25) / 1.25) * 100).toFixed(1)}%;background:${UTIL_COLORS[st]}"></span><i style="inset-inline-start:80%"></i></div><b>${esc(pct(util, 0))}</b></div></td><td>${pill(BUDGET_STATUS, st)}</td></tr>`;
    }).join('');
    const variance = annual ? forecast / annual - 1 : 0;
    return pageHead(T('navTreasuryGroup'), T('budgetTitle'), T('budgetSub', { fy: D.fiscalYear }), asOf() + exportButton('budget') + `<button class="btn primary" data-action="new-transfer">${icon('swap')}${T('newTransfer')}</button>`) +
      `<div class="grid kpis kpis-4">${kpi(T('kpiAnnualBudget'), esc(compact(annual)), esc(fyLabel()))}${kpi(T('kpiActualYtd'), esc(compact(actual)), T('kpiOfYtdBudget', { pct: pct(ytdBudget ? actual / ytdBudget : 0) }), actual > ytdBudget ? 'bad' : 'ok')}${kpi(T('kpiCommitments'), esc(compact(committed)), '', 'gold')}${kpi(T('kpiForecastFy'), esc(compact(forecast)), Th('kpiVsBudget', { pct: `<span class="delta ${variance <= 0 ? 'up' : 'down'}">${esc(signedPct(variance))}</span>` }), variance > 0 ? 'warn' : '')}</div>` +
      card(T('budgetTitle'), T('budgetSub', { fy: D.fiscalYear }), `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colCostCentre')}</th><th>${T('colEntity')}</th><th>${T('colOwner')}</th><th class="num">${T('colAnnualBudget')}</th><th class="num">${T('colBudgetYtd')}</th><th class="num">${T('colActualYtd')}</th><th class="num">${T('colCommitted')}</th><th class="num">${T('colAvailable')}</th><th>${T('colUtilisation')}</th><th>${T('colStatus')}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">${T('colTotal')}</td><td class="num">${esc(compact(annual))}</td><td class="num">${esc(compact(ytdBudget))}</td><td class="num">${esc(compact(actual))}</td><td class="num">${esc(compact(committed))}</td><td class="num">${esc(compact(annual - actual - committed))}</td><td colspan="2">${esc(pct(ytdBudget ? actual / ytdBudget : 0, 0))}</td></tr></tfoot></table></div>`, { flush: true }) + transfersCard();
  }
  const TRANSFER_STATUS = { submitted: ['tfSubmitted', 'warn'], approved: ['tfApproved', 'ok'], rejected: ['tfRejected', 'bad'] };
  function upsertTransfer(transfer) {
    const index = state.transfers.findIndex((x) => x.ref === transfer.ref);
    if (index === -1) state.transfers.unshift(transfer);
    else state.transfers[index] = transfer;
  }
  function transfersCard() {
    const list = state.transfers.filter((tr) => inScope((ccById[tr.from] || {}).entity) || inScope((ccById[tr.to] || {}).entity));
    const arrow = isAr() ? '\u2190' : '\u2192';
    const rows = list.map((tr) => `<tr><td><span class="primary-text"><bdi>${esc(tr.ref)}</bdi></span><span class="sub">${esc(tr.justification)}</span></td><td class="nowrap"><bdi>${esc(tr.from)}</bdi> ${arrow} <bdi>${esc(tr.to)}</bdi><span class="sub">${esc(nm(ccById[tr.from]))} ${arrow} ${esc(nm(ccById[tr.to]))}</span></td><td class="num">${esc(money(tr.amount))}</td><td>${personCell(tr.requestedBy)}</td><td class="nowrap">${esc(fmtDateTime(tr.requestedAt))}</td><td>${pill(TRANSFER_STATUS, tr.status)}</td></tr>`).join('');
    const body = rows
      ? `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colReference')}</th><th>${T('colFromTo')}</th><th class="num">${T('colAmount')}</th><th>${T('colRequestedBy')}</th><th>${T('colRequested')}</th><th>${T('colStatus')}</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">${T('noTransfers')}</div>`;
    return `<div class="mt">${card(T('transfersTitle'), T('transfersSub'), body, { flush: true })}</div>`;
  }
  function openTransfer() {
    const centres = D.costCentres.filter((c) => inScope(c.entity));
    const options = (selected) => centres.map((c, i) => `<option value="${esc(c.id)}"${i === selected ? ' selected' : ''}>${esc(c.id)} · ${esc(nm(c))}</option>`).join('');
    openModal({
      title: T('transferTitle'),
      body: `<div class="form-row"><label for="tfFrom">${T('fromCc')}</label><select id="tfFrom" class="field">${options(0)}</select></div><div class="form-row"><label for="tfTo">${T('toCc')}</label><select id="tfTo" class="field">${options(centres.length > 1 ? 1 : 0)}</select></div><div class="form-row"><label for="tfAmount">${T('amountQar')}</label><input id="tfAmount" class="field" type="number" min="1000" step="1000" inputmode="numeric"></div><div class="form-row"><label for="tfWhy">${T('justification')}</label><textarea id="tfWhy" class="field" maxlength="400"></textarea></div><div class="form-error" id="tfError"></div>`,
      confirm: {
        label: T('submitApproval'),
        cls: 'primary',
        run: () => {
          const from = $('#tfFrom').value;
          const to = $('#tfTo').value;
          const amount = Number($('#tfAmount').value);
          const why = $('#tfWhy').value.trim();
          if (!from || !to || from === to || !(amount > 0) || !why) {
            $('#tfError').textContent = t('transferInvalid');
            return false;
          }
          return api('api/budget-transfers', { from, to, amount, justification: why }).then((result) => {
            if (!result) return false;
            upsertTransfer(result.transfer);
            if (result.audit) addAudit(result.audit);
            toast(t('transferSubmitted', { ref: result.transfer.ref }));
            renderRoute();
            return true;
          });
        }
      }
    });
  }

  function vendorsList() {
    const f = state.vendors;
    const q = f.q.trim().toLowerCase();
    let list = D.vendors.filter((v) => state.entity === 'ALL' || v.serves.indexOf(state.entity) !== -1);
    if (f.status !== 'all') list = list.filter((v) => v.status === f.status);
    if (f.category !== 'all') list = list.filter((v) => v.category === f.category);
    if (q) list = list.filter((v) => [v.id, v.name, v.city, v.cr].join(' ').toLowerCase().indexOf(q) !== -1);
    const getters = { id: (v) => v.id, name: (v) => v.name, city: (v) => v.city, spend: (v) => vendorSpend[v.id] || 0, risk: (v) => ['low', 'medium', 'high'].indexOf(v.risk), status: (v) => v.status };
    return sortList(list, getters[f.sort] || getters.name, f.dir);
  }
  function tableVendors() {
    const list = vendorsList();
    if (!list.length) return `<div class="empty">${T('noResults')}</div>`;
    const page = paginate('vendors', list, 20);
    const rows = page.rows.map((v) => `<tr class="clickable" data-action="open-vendor" data-id="${esc(v.id)}"><td>${esc(v.id)}</td><td><span class="primary-text">${latin(v.name)}</span><span class="sub">${esc(v.cr)}</span></td><td>${esc(nm(D.categories[v.category]))}</td><td>${esc(v.city)}</td><td>${esc(v.currency)}</td><td class="nowrap">${T('netDays', { d: v.terms })}</td><td><span class="primary-text">${esc(v.bank)}</span><span class="sub mono ltr">${esc(v.iban)}</span></td><td>${pill(RISK, v.risk)}</td><td>${pill(VENDOR_STATUS, v.status)}</td><td class="num">${esc(compact(vendorSpend[v.id] || 0))}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="data"><thead><tr>${sortHeader('vendors', 'id', T('colVendorId'))}${sortHeader('vendors', 'name', T('colName'))}<th>${T('colCategory')}</th>${sortHeader('vendors', 'city', T('colCity'))}<th>${T('colCurrency')}</th><th>${T('colTerms')}</th><th>${T('colBankAccount')}</th>${sortHeader('vendors', 'risk', T('colRisk'))}${sortHeader('vendors', 'status', T('colStatus'))}${sortHeader('vendors', 'spend', T('factSpend'), 'num')}</tr></thead><tbody>${rows}</tbody></table></div>${page.html}`;
  }
  function viewVendors() {
    const scoped = D.vendors.filter((v) => state.entity === 'ALL' || v.serves.indexOf(state.entity) !== -1);
    const count = (st) => scoped.filter((v) => v.status === st).length;
    const statusOptions = [['all', 'fAll', scoped.length], ['active', 'vActive', count('active')], ['review', 'vReview', count('review')], ['blocked', 'vBlocked', count('blocked')]].map((o) => ({ value: o[0], label: T(o[1]), count: o[2] }));
    const categories = Object.keys(D.categories).map((k) => `<option value="${k}"${state.vendors.category === k ? ' selected' : ''}>${esc(nm(D.categories[k]))}</option>`).join('');
    return pageHead(T('navMaster'), T('vendorsTitle'), T('vendorsSub'), asOf() + exportButton('vendors')) +
      `<div class="grid kpis kpis-4">${kpi(T('kpiActiveVendors'), esc(num(count('active'))), '', 'ok')}${kpi(T('kpiReview'), esc(num(count('review'))), '', 'warn')}${kpi(T('kpiBlocked'), esc(num(count('blocked'))), '', 'bad')}${kpi(T('kpiForeign'), esc(num(scoped.filter((v) => v.currency !== 'QAR').length)), 'USD · EUR', 'gold')}</div>` +
      `<section class="card"><div class="toolbar">${chips('vendors', 'status', statusOptions, state.vendors.status)}<select class="field" data-input="vendors" data-key="category" aria-label="${T('colCategory')}"><option value="all">${T('categoryAll')}</option>${categories}</select><input class="field grow" type="search" data-input="vendors" data-key="q" value="${esc(state.vendors.q)}" placeholder="${T('filterPlaceholder')}" aria-label="${T('filterPlaceholder')}"></div><div id="tableHost">${tableVendors()}</div></section>`;
  }

  /* ---------- Reports and CSV export ---------- */
  const stamp = () => D.today.replace(/-/g, '');
  const enMonth = (m) => new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(D.fiscalYear, m, 1));
  function csvCell(value) {
    if (typeof value === 'number') return String(Math.round(value * 100) / 100);
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function download(file, rows) {
    const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  const agingRowsFor = (items, keyOf, labelOf, amountOf) => {
    const map = {};
    items.forEach((item) => {
      const key = keyOf(item);
      const row = map[key] || (map[key] = [0, 0, 0, 0, 0]);
      row[bucketOf(item.dueDate)] += amountOf(item);
    });
    return Object.keys(map).sort().map((key) => labelOf(key).concat(map[key], [map[key].reduce((a, b) => a + b, 0)]));
  };
  const EXPORTS = {
    ap: () => ({ name: 'AP invoices', file: `ATH_AP_Invoices_${stamp()}.csv`, rows: [['Invoice', 'Vendor invoice no.', 'Vendor', 'Entity', 'Cost centre', 'Invoice date', 'Due date', 'Currency', 'Amount', 'Amount (QAR)', 'Match', 'Status', 'Payment run']].concat(payablesList().map((i) => [i.id, i.vendorRef, vendorById[i.vendorId].name, i.entityId, i.ccId, i.invoiceDate, i.dueDate, i.currency, i.amount, i.amountQar, i.match, i.status, i.paymentRun || ''])) }),
    ar: () => ({ name: 'AR register', file: `ATH_AR_Register_${stamp()}.csv`, rows: [['Document', 'Customer', 'Entity', 'Reference', 'Issue date', 'Due date', 'Amount (QAR)', 'Outstanding (QAR)', 'Status']].concat(receivablesList().map((r) => [r.id, customerById[r.customerId].name, r.entityId, r.reference, r.issueDate, r.dueDate, r.amount, outstanding(r), r.status])) }),
    vendors: () => ({ name: 'Vendor master', file: `ATH_Vendor_Master_${stamp()}.csv`, rows: [['Vendor ID', 'Name', 'Category', 'City', 'Currency', 'Terms (days)', 'Bank', 'Risk', 'Status', 'Spend YTD (QAR)']].concat(vendorsList().map((v) => [v.id, v.name, D.categories[v.category].name, v.city, v.currency, v.terms, v.bank, v.risk, v.status, vendorSpend[v.id] || 0])) }),
    audit: () => ({ name: 'Audit log', file: `ATH_Audit_Log_${stamp()}.csv`, rows: [['Timestamp', 'User', 'Action', 'Object', 'Reference', 'Source IP', 'Outcome']].concat(auditList().map((a) => [a.at, people[a.user].name, a.action, a.object, a.ref, a.ip, a.outcome])) }),
    accounts: () => ({ name: 'Cash position', file: `ATH_Cash_Position_${stamp()}.csv`, rows: [['Account', 'Bank', 'Entity', 'Account name', 'Currency', 'Balance', 'Balance (QAR)', 'Statement date']].concat(D.accounts.filter((a) => inScope(a.entity)).map((a) => [a.id, bankById[a.bank].name, a.entity, a.name, a.currency, a.balance, a.balanceQar, a.statement])) }),
    budget: () => ({ name: 'Budget variance', file: `ATH_Budget_Variance_${stamp()}.csv`, rows: [['Cost centre', 'Name', 'Entity', 'Owner', 'Annual budget', 'Budget YTD', 'Actual YTD', 'Committed', 'Available', 'Utilisation %']].concat(D.costCentres.filter((c) => inScope(c.entity)).map((c) => [c.id, c.name, c.entity, c.manager.name, c.budget, c.budgetYtd, c.actualYtd, c.committed, c.budget - c.actualYtd - c.committed, c.budgetYtd ? (c.actualYtd / c.budgetYtd) * 100 : 0])) }),
    runs: () => ({ name: 'Payment run register', file: `ATH_Payment_Runs_${stamp()}.csv`, rows: [['Run', 'Value date', 'Status', 'Payments', 'Total (QAR)', 'Channel', 'Bank file']].concat(D.paymentRuns.map((r) => [r.id, r.date, r.status, r.payments, r.amountQar, r.channel, r.file])) }),
    mgmt: () => ({ name: 'Management pack', file: `ATH_Management_Pack_${stamp()}.csv`, rows: [['Entity', 'Period', 'Revenue (QAR)', 'Budget revenue (QAR)', 'Operating costs (QAR)', 'EBITDA (QAR)']].concat([].concat.apply([], scopeEntities().map((e) => D.monthly[e.id].map((m) => [e.name, enMonth(m.month) + ' ' + D.fiscalYear + (m.mtd ? ' (MTD)' : ''), m.revenue, m.budgetRevenue, m.opex, m.ebitda])))) }),
    apAging: () => ({ name: 'AP aging', file: `ATH_AP_Aging_${stamp()}.csv`, rows: [['Vendor', 'Not yet due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days', 'Total (QAR)']].concat(agingRowsFor(D.invoices.filter((i) => inScope(i.entityId) && isOpenAp(i)), (i) => i.vendorId, (id) => [vendorById[id].name], (i) => i.amountQar)) }),
    arAging: () => ({ name: 'AR aging', file: `ATH_AR_Aging_${stamp()}.csv`, rows: [['Customer', 'Entity', 'Not yet due', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days', 'Total (QAR)']].concat(agingRowsFor(D.receivables.filter((r) => inScope(r.entityId) && isOpenAr(r)), (r) => r.customerId, (id) => [customerById[id].name, customerById[id].entity], outstanding)) }),
    spend: () => ({ name: 'Vendor spend', file: `ATH_Vendor_Spend_${stamp()}.csv`, rows: [['Vendor ID', 'Vendor', 'Category', 'Invoices', 'Spend YTD (QAR)']].concat(D.vendors.map((v) => [v.id, v.name, D.categories[v.category].name, D.invoices.filter((i) => i.vendorId === v.id && inScope(i.entityId)).length, vendorSpend[v.id] || 0])) })
  };
  function exportCsv(what) {
    const spec = EXPORTS[what];
    if (!spec) return;
    const result = spec();
    download(result.file, result.rows);
    recordActivity('export', 'report', result.name);
    toast(t('exported', { n: num(result.rows.length - 1) }));
  }
  const REPORTS = [
    { id: 'mgmt', title: 'rMgmt', desc: 'rMgmtDesc', sched: 'schedMonthly' },
    { id: 'apAging', title: 'rApAging', desc: 'rApAgingDesc', sched: 'schedWeekly' },
    { id: 'arAging', title: 'rArAging', desc: 'rArAgingDesc', sched: 'schedWeekly' },
    { id: 'accounts', title: 'rCash', desc: 'rCashDesc', sched: 'schedDaily' },
    { id: 'budget', title: 'rBudget', desc: 'rBudgetDesc', sched: 'schedMonthly' },
    { id: 'spend', title: 'rSpend', desc: 'rSpendDesc', sched: 'schedOnDemand' },
    { id: 'runs', title: 'rRuns', desc: 'rRunsDesc', sched: 'schedWeekly' },
    { id: 'audit', title: 'rAudit', desc: 'rAuditDesc', sched: 'schedOnDemand' }
  ];
  function lastScheduled(sched) {
    const d = new Date(today);
    if (sched === 'schedDaily') {
      d.setHours(7, 30, 0, 0);
      if (d > new Date()) d.setDate(d.getDate() - 1);
      while (!isWorkday(d)) d.setDate(d.getDate() - 1);
      return d;
    }
    if (sched === 'schedWeekly') {
      while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
      d.setHours(8, 0, 0, 0);
      return d;
    }
    if (sched === 'schedMonthly') {
      const third = (year, month) => {
        const x = new Date(year, month, 1, 6, 0, 0, 0);
        let n = 0;
        while (true) {
          if (isWorkday(x)) n += 1;
          if (n === 3) return x;
          x.setDate(x.getDate() + 1);
        }
      };
      const current = third(today.getFullYear(), today.getMonth());
      return current <= new Date() ? current : third(today.getFullYear(), today.getMonth() - 1);
    }
    return null;
  }
  function viewReports() {
    const cards = REPORTS.map((r) => {
      const last = state.reportRuns[r.id] || lastScheduled(r.sched);
      return `<section class="card report-card"><span class="type-icon">${icon('reports')}</span><h3>${T(r.title)}</h3><p>${T(r.desc)}</p><div class="report-meta"><span>${T('schedule')}: ${T(r.sched)}</span></div><div class="report-meta"><span>${last ? T('lastGenerated', { when: fmtDateTime(last) }) : '&nbsp;'}</span><button class="btn sm primary" data-action="report" data-id="${r.id}">${icon('download')}${T('generateCsv')}</button></div></section>`;
    }).join('');
    return pageHead(T('navGovernance'), T('reportsTitle'), T('reportsSub'), asOf()) + `<div class="report-grid">${cards}</div>`;
  }
  function runReport(id) {
    const report = REPORTS.find((r) => r.id === id);
    if (!report) return;
    const result = EXPORTS[id]();
    download(result.file, result.rows);
    state.reportRuns[id] = new Date();
    recordActivity('export', 'report', result.name);
    toast(t('reportReady', { name: t(report.title) }));
    renderRoute();
  }

  function auditList() {
    const f = state.audit;
    const q = f.q.trim().toLowerCase();
    return state.audits.filter((a) => (f.user === 'all' || a.user === f.user) && (f.action === 'all' || a.action === f.action) &&
      (!q || [a.ref, a.ip, nm(people[a.user]), people[a.user].name].join(' ').toLowerCase().indexOf(q) !== -1));
  }
  function tableAudit() {
    const list = auditList();
    if (!list.length) return `<div class="empty">${T('noResults')}</div>`;
    const page = paginate('audit', list, 25);
    const rows = page.rows.map((a) => `<tr><td class="nowrap">${esc(fmtDateTime(a.at))}</td><td>${personCell(a.user)}</td><td>${T(AUDIT_ACTION[a.action] || a.action)}</td><td>${T(AUDIT_OBJECT[a.object] || a.object)} <span class="muted"><bdi>${esc(a.ref)}</bdi></span></td><td><span class="mono small ltr">${esc(a.ip)}</span></td><td>${pill(OUTCOME, a.outcome)}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="data"><thead><tr><th>${T('colTimestamp')}</th><th>${T('colUser')}</th><th>${T('colAction')}</th><th>${T('colObject')}</th><th>${T('colSourceIp')}</th><th>${T('colOutcome')}</th></tr></thead><tbody>${rows}</tbody></table></div>${page.html}`;
  }
  function viewAudit() {
    const users = Array.from(new Set(state.audits.map((a) => a.user))).map((id) => people[id]).sort((a, b) => nm(a).localeCompare(nm(b)));
    const actions = Array.from(new Set(state.audits.map((a) => a.action)));
    return pageHead(T('navGovernance'), T('auditTitle'), T('auditSub'), asOf() + exportButton('audit')) +
      `<section class="card"><div class="toolbar"><select class="field" data-input="audit" data-key="user" aria-label="${T('colUser')}"><option value="all">${T('allUsers')}</option>${users.map((p) => `<option value="${esc(p.id)}"${state.audit.user === p.id ? ' selected' : ''}>${esc(nm(p))}</option>`).join('')}</select><select class="field" data-input="audit" data-key="action" aria-label="${T('colAction')}"><option value="all">${T('allActions')}</option>${actions.map((a) => `<option value="${esc(a)}"${state.audit.action === a ? ' selected' : ''}>${T(AUDIT_ACTION[a] || a)}</option>`).join('')}</select><input class="field grow" type="search" data-input="audit" data-key="q" value="${esc(state.audit.q)}" placeholder="${T('filterPlaceholder')}" aria-label="${T('filterPlaceholder')}"></div><div id="tableHost">${tableAudit()}</div></section>`;
  }

  /* ---------- Drawers, modals, popovers, toasts ---------- */
  const overlays = { drawer: null, modal: null, popover: null };
  function openDrawer(html) {
    closeDrawer(true);
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.dataset.action = 'close-drawer';
    const drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.innerHTML = html;
    document.body.append(scrim, drawer);
    requestAnimationFrame(() => {
      scrim.classList.add('show');
      drawer.classList.add('show');
      const close = drawer.querySelector('[data-action="close-drawer"]');
      if (close) close.focus();
    });
    overlays.drawer = { scrim, drawer };
  }
  function closeDrawer(immediate) {
    const d = overlays.drawer;
    if (!d) return;
    overlays.drawer = null;
    d.scrim.classList.remove('show');
    d.drawer.classList.remove('show');
    const remove = () => { d.scrim.remove(); d.drawer.remove(); };
    if (immediate) remove(); else setTimeout(remove, 260);
  }
  function openModal(options) {
    closeModal(true);
    const scrim = document.createElement('div');
    scrim.className = 'scrim top';
    scrim.dataset.action = 'close-modal';
    const modal = document.createElement('div');
    modal.className = 'modal' + (options.wide ? ' wide' : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const confirm = options.confirm;
    state.modalConfirm = confirm ? confirm.run : null;
    const foot = options.actions || (confirm ? `<button class="btn" data-action="close-modal">${T('cancel')}</button><button class="btn ${confirm.cls || 'primary'}" data-action="modal-confirm">${confirm.label}</button>` : `<button class="btn" data-action="close-modal">${T('close')}</button>`);
    modal.innerHTML = `<div class="modal-head"><h2>${options.title}</h2><button class="btn icon-only" data-action="close-modal" aria-label="${T('close')}">${icon('x')}</button></div><div class="modal-body">${options.body}</div><div class="modal-foot">${foot}</div>`;
    document.body.append(scrim, modal);
    requestAnimationFrame(() => {
      scrim.classList.add('show');
      modal.classList.add('show');
      const focusable = modal.querySelector('textarea, input, select') || modal.querySelector('.modal-foot .btn:last-child');
      if (focusable) focusable.focus();
    });
    overlays.modal = { scrim, modal };
  }
  function closeModal(immediate) {
    const m = overlays.modal;
    if (!m) return;
    overlays.modal = null;
    state.modalConfirm = null;
    m.scrim.classList.remove('show');
    m.modal.classList.remove('show');
    const remove = () => { m.scrim.remove(); m.modal.remove(); };
    if (immediate) remove(); else setTimeout(remove, 200);
  }
  function togglePopover(kind, trigger) {
    if (overlays.popover && overlays.popover.kind === kind) { closePopover(); return; }
    closePopover();
    const el = document.createElement('div');
    el.className = 'popover';
    el.setAttribute('role', 'dialog');
    el.innerHTML = kind === 'notifications' ? notificationsHtml() : userMenuHtml();
    document.body.appendChild(el);
    const rect = trigger.getBoundingClientRect();
    el.style.top = rect.bottom + 8 + 'px';
    if (isAr()) el.style.left = Math.max(8, rect.left) + 'px';
    else el.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    overlays.popover = { kind, el, trigger };
  }
  function closePopover() {
    if (!overlays.popover) return;
    overlays.popover.el.remove();
    overlays.popover = null;
  }
  function closeAll() {
    closePopover();
    closeModal(true);
    closeDrawer(true);
  }
  function toast(message, isError) {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = isError ? 'toast error' : 'toast';
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.innerHTML = icon(isError ? 'alert' : 'check') + `<span>${esc(message)}</span>`;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }

  function chainSteps(inv) {
    return inv.chain.map((s) => {
      const who = people[s.approver];
      let when = t('stepWaiting');
      if (s.status === 'done') when = t('stepDone', { date: fmtDateTime(s.at) });
      else if (s.status === 'rejected') when = t('stepRejected', { date: fmtDateTime(s.at) });
      else if (s.status === 'current') when = t('stepCurrent', { date: fmtDate(s.since) });
      if (s.comment) when += ' — “' + s.comment + '”';
      return stepHtml({ state: s.status === 'waiting' ? '' : s.status, who, role: t(ROLE[s.role]), when });
    }).join('');
  }
  function openInvoice(id) {
    const inv = invoiceById[id];
    if (!inv) return;
    const v = vendorById[inv.vendorId];
    const cc = ccById[inv.ccId];
    const approval = state.approvals.find((a) => a.type === 'invoice' && a.ref === inv.id);
    const due = daysFromToday(inv.dueDate);
    const rows = [
      ['factVendorRef', esc(inv.vendorRef)],
      ['factPo', inv.poNumber ? esc(inv.poNumber) : T('notApplicable')],
      ['factGrn', inv.grn ? esc(inv.grn) : T('notApplicable')],
      ['factTerms', T('netDays', { d: inv.terms })],
      ['colInvoiceDate', esc(fmtDate(inv.invoiceDate))],
      ['factReceived', esc(fmtDate(inv.received))],
      ['colDueDate', esc(fmtDate(inv.dueDate)) + (isOpenAp(inv) && due < 0 ? ` <span class="pill bad">${T('overdueBy', { d: -due })}</span>` : '')],
      ['factCostCentre', `<bdi>${esc(cc.id)}</bdi> · ${esc(nm(cc))}`],
      ['factRun', inv.paymentRun ? `<bdi>${esc(inv.paymentRun)}</bdi>` : T('notApplicable')],
      ['factPaidOn', inv.paidDate ? esc(fmtDate(inv.paidDate)) : T('notApplicable')]
    ];
    if (inv.currency !== 'QAR') rows.push(['factFx', esc(num(inv.fxRate, 4))]);
    const lines = inv.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="num">${esc(num(l.qty))}</td><td class="num">${esc(num(l.unit, 2))}</td><td class="num">${esc(num(l.amount, 2))}</td></tr>`).join('');
    const hold = inv.holdReason && (inv.status === 'hold' || inv.status === 'disputed') ? `<div class="notice bad" style="margin-top:14px">${icon('alert')}<div><strong>${T('holdReason')}</strong><br>${esc(inv.holdReason[isAr() ? 1 : 0])}</div></div>` : '';
    const docs = [['docInvoice', 'invoice'], inv.poNumber ? ['docPo', 'po'] : null, inv.grn ? ['docGrn', 'grn'] : null].filter(Boolean)
      .map((d) => `<div class="doc-row">${icon('file')}<span class="grow">${T(d[0])}</span><button class="btn sm" data-action="view-doc" data-kind="${d[1]}" data-id="${esc(inv.id)}">${icon('eye')}${T('viewDoc')}</button></div>`).join('');
    let actions = '';
    if (inv.status === 'approved' || inv.status === 'scheduled') actions += `<button class="btn" data-action="hold-invoice" data-id="${esc(inv.id)}">${icon('pause')}${T('putOnHold')}</button>`;
    if (inv.status === 'hold') actions += `<button class="btn" data-action="release-invoice" data-id="${esc(inv.id)}">${icon('play')}${T('releaseHold')}</button>`;
    if (approval) actions += `<button class="btn danger" data-action="decide" data-decision="reject" data-id="${esc(approval.id)}">${T('reject')}</button><button class="btn primary" data-action="decide" data-decision="approve" data-id="${esc(approval.id)}">${icon('check')}${T('approve')}</button>`;
    openDrawer(`<div class="drawer-head"><div><div class="eyebrow">${T('invoiceDetails')}</div><h2><bdi>${esc(inv.id)}</bdi></h2><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${pill(AP_STATUS, inv.status)}${pill(MATCH, inv.match)}</div></div><button class="btn icon-only" data-action="close-drawer" aria-label="${T('close')}">${icon('x')}</button></div>` +
      `<div class="drawer-body"><div class="muted small">${esc(nm(entityById[inv.entityId]))}</div><div style="font-size:15px;font-weight:600;margin:2px 0 8px"><a href="#" data-action="open-vendor" data-id="${esc(v.id)}">${latin(v.name)}</a></div><div class="amount-hero">${esc(money(inv.amount, 2, inv.currency))}</div>${inv.currency !== 'QAR' ? `<div class="muted">${esc(money(inv.amountQar))}</div>` : ''}${hold}${facts(rows)}` +
      `<div class="section-title">${T('linesTitle')}</div><div class="table-wrap" style="border:1px solid var(--line);border-radius:10px"><table class="data"><thead><tr><th>${T('colDescription')}</th><th class="num">${T('colQty')}</th><th class="num">${T('colUnitPrice')}</th><th class="num">${T('colAmount')} (${esc(inv.currency)})</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="3">${T('colTotal')}</td><td class="num">${esc(num(inv.amount, 2))}</td></tr></tfoot></table></div>` +
      `<div class="section-title">${T('chainTitle')}</div><div class="steps" style="padding:0">${chainSteps(inv)}</div><div class="section-title">${T('documents')}</div>${docs}</div>` +
      (actions ? `<div class="drawer-foot">${actions}</div>` : ''));
  }
  async function holdInvoice(id, hold, button) {
    const inv = invoiceById[id];
    if (!inv) return;
    if (button) button.disabled = true;
    const result = await api(`api/invoices/${encodeURIComponent(id)}/hold`, { hold });
    if (!result) {
      if (button) button.disabled = false;
      return;
    }
    Object.assign(inv, result.invoice);
    if (result.audit) addAudit(result.audit);
    toast(t(hold ? 'heldMsg' : 'releasedMsg', { ref: inv.id }));
    renderRoute();
    openInvoice(inv.id);
  }
  function invoiceDocument(inv) {
    const v = vendorById[inv.vendorId];
    const ent = entityById[inv.entityId];
    const f2 = (n) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const d = (s) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parseDate(s));
    const lines = inv.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="num">${esc(l.qty)}</td><td class="num">${f2(l.unit)}</td><td class="num">${f2(l.amount)}</td></tr>`).join('');
    return `<div class="doc"><div class="doc-top"><div><h3>${esc(v.name)}</h3><div class="muted">${esc(v.city)}${v.currency === 'QAR' ? ', State of Qatar' : ''}</div><div class="muted">${esc(v.cr)}</div></div><div style="text-align:right"><div class="doc-title">INVOICE</div><div>No. ${esc(inv.vendorRef)}</div><div>Date ${esc(d(inv.invoiceDate))}</div></div></div>` +
      `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:14px"><div><div class="muted small">BILL TO</div><strong>${esc(ent.name)}</strong><div>P.O. Box ${esc(PO_BOX[ent.id] || '22410')}, Doha, State of Qatar</div></div><div style="text-align:right"><div class="muted small">YOUR REFERENCE</div><div>${esc(inv.poNumber || 'Contract billing')}</div><div class="muted small" style="margin-top:6px">DUE DATE</div><div>${esc(d(inv.dueDate))}</div></div></div>` +
      `<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount (${esc(inv.currency)})</th></tr></thead><tbody>${lines}</tbody></table>` +
      `<div class="totals"><div><span>Subtotal</span><span>${f2(inv.amount)}</span></div><div class="grand"><span>Total due (${esc(inv.currency)})</span><span>${f2(inv.amount)}</span></div></div>` +
      `<div class="small" style="margin-top:16px"><strong>Payment details</strong><br>Beneficiary bank: ${esc(bankById[v.bank] ? bankById[v.bank].name : v.bank)}<br>Account: ${esc(v.iban)}<br>Payment terms: Net ${esc(inv.terms)} days from invoice date</div>` +
      `<div class="stamp">RECEIVED ${esc(d(inv.received))} · AP SCANNING</div></div>`;
  }
  function viewDocument(id, kind) {
    const inv = invoiceById[id];
    if (!inv) return;
    if (kind !== 'invoice') {
      toast(t('docUnavailable'));
      return;
    }
    recordActivity('view', 'invoice', inv.id);
    openModal({ title: T('docInvoice') + ' · <bdi>' + esc(inv.vendorRef) + '</bdi>', body: invoiceDocument(inv), wide: true });
  }
  function openVendor(id) {
    const v = vendorById[id];
    if (!v) return;
    const invoices = D.invoices.filter((i) => i.vendorId === v.id).sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : -1));
    const open = invoices.filter(isOpenAp);
    const change = state.approvals.find((a) => a.type === 'vendor' && a.vendorId === v.id);
    const recent = invoices.slice(0, 6).map((i) => `<tr class="clickable" data-action="open-invoice" data-id="${esc(i.id)}"><td><span class="primary-text">${esc(i.id)}</span><span class="sub">${esc(i.vendorRef)}</span></td><td class="nowrap">${esc(fmtDate(i.invoiceDate))}</td><td class="num">${esc(money(i.amountQar))}</td><td>${pill(AP_STATUS, i.status)}</td></tr>`).join('');
    const actions = change ? `<button class="btn danger" data-action="decide" data-decision="reject" data-id="${esc(change.id)}">${T('reject')}</button><button class="btn primary" data-action="decide" data-decision="approve" data-id="${esc(change.id)}">${icon('check')}${T('approve')}</button>` : '';
    openDrawer(`<div class="drawer-head"><div><div class="eyebrow">${T('vendorsTitle')}</div><h2>${latin(v.name)}</h2><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${pill(VENDOR_STATUS, v.status)}${pill(RISK, v.risk)}</div></div><button class="btn icon-only" data-action="close-drawer" aria-label="${T('close')}">${icon('x')}</button></div>` +
      `<div class="drawer-body">${change ? `<div class="notice warn">${icon('alert')}<span>${T('nVendor', { vendor: isolate(v.name) })}</span></div>` : ''}${facts([
        ['colVendorId', esc(v.id)],
        ['factCr', esc(v.cr)],
        ['colCategory', esc(nm(D.categories[v.category]))],
        ['colCity', esc(v.city)],
        ['colCurrency', esc(v.currency)],
        ['colTerms', T('netDays', { d: v.terms })],
        ['factSince', esc(v.since)],
        ['factSpend', esc(money(vendorSpend[v.id] || 0))],
        ['factOpenInv', `${esc(num(open.length))} · ${esc(compact(sum(open, (i) => i.amountQar)))}`],
        ['factContact', latin(v.contact)],
        ['colBankAccount', `${esc(nm(bankById[v.bank]))}<br><span class="mono small ltr">${esc(v.iban)}</span>`],
        ['factBankCheck', change ? `<span class="pill warn">${T('bankPending')}</span>` : `<span class="pill ok">${T('bankVerified')}</span>`]
      ])}<div class="section-title">${T('vendorRecent')}</div><div class="table-wrap" style="border:1px solid var(--line);border-radius:10px"><table class="data"><tbody>${recent || `<tr><td class="empty">${T('noResults')}</td></tr>`}</tbody></table></div></div>` +
      (actions ? `<div class="drawer-foot">${actions}</div>` : ''));
  }

  function notificationText(n) {
    if (n.kind === 'run') return t('nRun', { ref: n.ref, amount: compact(n.amountQar) });
    if (n.kind === 'sla') return t('nSla', { n: n.count });
    if (n.kind === 'vendor') return t('nVendor', { vendor: isolate(vendorById[n.vendorId].name) });
    if (n.kind === 'budget') {
      const cc = ccById[n.ccId];
      return t('nBudget', { cc: cc.id + ' ' + nm(cc), pct: pct(cc.actualYtd / cc.budgetYtd, 0) });
    }
    return t('nClose', { p: periodLabel(priorPeriod()) });
  }
  const NOTIF_STYLE = { run: ['runs', 'info'], sla: ['alert', 'warn'], vendor: ['vendors', 'bad'], budget: ['budget', 'warn'], close: ['lock', 'ok'] };
  function notificationsHtml() {
    const items = D.notifications.map((n, i) => {
      const style = NOTIF_STYLE[n.kind];
      return `<div class="notif${i < state.unread ? ' unread' : ''}"><span class="notif-icon" style="background:var(--${style[1]}-bg);color:var(--${style[1]})">${icon(style[0])}</span><div><p>${esc(notificationText(n))}</p><span class="small muted">${esc(relTime(n.at))}</span></div></div>`;
    }).join('');
    return `<header><span>${T('notifications')}</span>${state.unread ? `<button class="link-btn" data-action="mark-read">${T('markAllRead')}</button>` : ''}</header>${items}`;
  }
  const userMenuHtml = () => `<div class="menu-head">${avatar(persona)}<div><strong>${esc(nm(persona))}</strong><div class="small muted">${esc(roleTitle(persona))}</div><div class="small muted ltr">${esc(persona.account)}</div></div></div><ul class="menu-list"><li><button data-action="profile">${icon('user')}${T('myProfile')}</button></li><li><button data-action="toggle-lang">${icon('globe')}${T('langSwitch')}</button></li><li><button data-action="about">${icon('info')}${T('aboutPortal')}</button></li><li><button data-action="sign-out">${icon('logout')}${T('signOut')}</button></li></ul>`;
  function openProfile() {
    openModal({
      title: T('profileTitle'),
      body: `<div style="display:flex;gap:14px;align-items:center;margin-bottom:6px"><span class="avatar" style="width:48px;height:48px;font-size:17px">${esc(persona.initials)}</span><div><strong style="font-size:16px">${esc(nm(persona))}</strong><div class="muted">${esc(roleTitle(persona))}</div></div></div>${facts([
        ['profileAccount', `<span class="ltr">${esc(persona.account)}</span>`],
        ['profileRole', esc(roleTitle(persona))],
        ['profileEntity', esc(nm(entityById.ATH))],
        ['profileDoa', T('profileDoaValue')],
        ['profileGroups', '<span class="mono small ltr">FIN-Portal-Controllers · FIN-DoA-Level2</span>'],
        ['profileLastSignIn', esc(fmtDateTime(startedAt))]
      ])}`
    });
  }
  function platformFacts() {
    const p = D.platform;
    if (!p) return '';
    return `<div class="section-title">${T('aboutPlatform')}</div>` + facts([
      ['platformServer', latin(p.server)],
      ['platformWeb', latin([p.webServer, p.runtime].filter(Boolean).join(' · '))],
      ['platformDatabase', latin(p.database)],
      ['platformTreasury', latin(p.treasury)]
    ]);
  }
  function openAbout() {
    const build = `${D.fiscalYear}.${String(D.currentPeriod + 1).padStart(2, '0')}.1185`;
    openModal({
      title: T('aboutTitle'),
      body: `<div style="display:flex;gap:14px;align-items:center">${logoMark('mark-lg').replace('class="mark-lg"', 'class="mark-lg" style="width:52px;height:52px"')}<div><strong style="font-size:16px">${T('appName')}</strong><div class="muted">${T('orgLegal')}</div><div class="small muted">${T('aboutVersion', { build })}</div></div></div>` +
        `<ul class="key-list" style="margin-top:16px"><li><span>${T('aboutOwner')}</span></li><li><span>${T('aboutSupport')}</span></li><li><span>${T('aboutHosting')}</span></li></ul>` +
        platformFacts() +
        `<div class="section-title">${T('aboutDevelopedBy')}</div><div style="display:flex;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#faf8f6"><span class="avatar" style="width:40px;height:40px;font-size:14px">ZS</span><div><strong>Zahir Hussain Shah</strong><div class="small muted">${T('devTitle')}</div><div class="small muted">${T('devOrg')}</div></div></div>` +
        `<div class="notice info" style="margin-top:16px">${icon('info')}<span>${T('aboutDemo')}</span></div>`
    });
  }

  /* ---------- Shell, navigation and routing ---------- */
  const NAV = [
    ['navOverview', [['dashboard', 'navDashboard', 'dashboard'], ['approvals', 'navApprovals', 'approvals']]],
    ['navOperations', [['payables', 'navPayables', 'payables'], ['runs', 'navRuns', 'runs'], ['receivables', 'navReceivables', 'receivables']]],
    ['navTreasuryGroup', [['treasury', 'navTreasury', 'treasury'], ['budget', 'navBudget', 'budget']]],
    ['navMaster', [['vendors', 'navVendors', 'vendors']]],
    ['navGovernance', [['reports', 'navReports', 'reports'], ['audit', 'navAudit', 'audit']]]
  ];
  const VIEWS = { dashboard: viewDashboard, approvals: viewApprovals, payables: viewPayables, runs: viewRuns, receivables: viewReceivables, treasury: viewTreasury, budget: viewBudget, vendors: viewVendors, reports: viewReports, audit: viewAudit };
  const TABLES = { ap: tablePayables, ar: tableReceivables, vendors: tableVendors, audit: tableAudit };

  function periodCard() {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const total = workdaysBetween(first, last);
    const elapsed = workdaysBetween(first, today);
    return `<div class="period-card"><div class="row"><span class="small muted">${T('periodTitle')}</span><span class="pill ok">${T('periodOpen')}</span></div><strong>${esc(monthName(D.currentPeriod, 'long'))} ${D.fiscalYear}</strong><div class="small muted" style="margin:4px 0 8px">${T('periodDay', { d: elapsed, n: total })}</div><div class="progress"><span style="width:${((elapsed / total) * 100).toFixed(1)}%"></span></div><div class="small muted" style="margin-top:8px">${T('priorClosed', { p: periodLabel(priorPeriod()) })}</div></div>`;
  }
  function renderNav(view) {
    const counts = { approvals: state.approvals.length, runs: state.approvals.some((a) => a.type === 'run') ? 1 : 0 };
    $('#sidebar').innerHTML = NAV.map((group) => `<div class="nav-group"><div class="nav-label">${T(group[0])}</div>${group[1].map((item) => `<a class="nav-item${item[0] === view ? ' active' : ''}" href="#/${item[0]}"${item[0] === view ? ' aria-current="page"' : ''}>${icon(item[2])}<span>${T(item[1])}</span>${counts[item[0]] ? `<span class="nav-count">${counts[item[0]]}</span>` : ''}</a>`).join('')}</div>`).join('') + periodCard();
  }
  function updateBell() {
    const btn = $('#bellBtn');
    if (btn) btn.innerHTML = icon('bell') + (state.unread ? `<span class="badge-dot">${state.unread}</span>` : '');
  }
  function renderShell() {
    const html = document.documentElement;
    html.lang = state.lang;
    html.dir = isAr() ? 'rtl' : 'ltr';
    document.title = `${t('appName')} · ${t('orgName')}`;
    const entityOptions = `<option value="ALL">${T('allEntities')}</option>` + D.entities.map((e) => `<option value="${e.id}"${state.entity === e.id ? ' selected' : ''}>${esc(e.id)} · ${esc(nm(e))}</option>`).join('');
    $('#app').innerHTML = `<header class="topbar"><div class="brand">${logoMark('mark')}<div class="brand-text"><span class="brand-name">${T('orgLine1')}</span><span class="brand-sub">${T('orgLine2')}</span></div>${serration('serration')}</div>` +
      `<div class="topbar-main"><span class="app-title">${T('appName')}</span><select class="glass entity-select" id="entitySelect" aria-label="${T('colEntity')}">${entityOptions}</select>` +
      `<div class="search">${icon('search')}<input class="glass" id="globalSearch" type="search" autocomplete="off" placeholder="${T('searchPlaceholder')}" aria-label="${T('searchPlaceholder')}"><div class="search-results" id="searchResults" hidden></div></div><span class="spacer"></span>` +
      `<button class="glass lang-btn" data-action="toggle-lang" lang="${isAr() ? 'en' : 'ar'}">${T('langSwitch')}</button><button class="glass icon-btn" id="bellBtn" data-action="toggle-notifications" aria-label="${T('notifications')}"></button>` +
      `<button class="glass user-btn" data-action="toggle-user" aria-label="${T('myProfile')}">${avatar(persona)}<span class="user-meta"><strong>${esc(nm(persona))}</strong><span>${esc(roleTitle(persona))}</span></span></button></div></header>` +
      `<div class="shell"><nav class="sidebar" id="sidebar" aria-label="${T('appName')}"></nav><main class="content" id="view" tabindex="-1"></main></div>` +
      `<footer class="statusbar"><span>${T('footerRights', { year: D.fiscalYear })}</span><span class="classification">${icon('lock')}${T('classification')}</span><span>${T('footerVersion')}</span></footer>`;
    updateBell();
  }
  const currentView = () => {
    const name = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    return has(VIEWS, name) ? name : 'dashboard';
  };
  const treasuryNotice = () => (D.treasuryError ? `<div class="notice bad" style="margin-bottom:16px">${icon('alert')}<span>${T('treasuryUnavailable', { msg: D.treasuryError })}</span></div>` : '');
  function renderRoute() {
    const view = currentView();
    renderNav(view);
    $('#view').innerHTML = treasuryNotice() + VIEWS[view]();
    const detail = state.pendingDetail;
    state.pendingDetail = null;
    if (detail && detail.kind === 'invoice') openInvoice(detail.id);
    if (detail && detail.kind === 'vendor') openVendor(detail.id);
  }
  function go(view, detail) {
    state.pendingDetail = detail || null;
    if (currentView() === view) renderRoute();
    else location.hash = '#/' + view;
  }
  function refreshTable(scope) {
    const host = $('#tableHost');
    if (host && TABLES[scope]) host.innerHTML = TABLES[scope]();
  }

  /* ---------- Global search ---------- */
  function runSearch(value) {
    const box = $('#searchResults');
    const q = value.trim().toLowerCase();
    if (q.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const match = (s) => String(s).toLowerCase().indexOf(q) !== -1;
    const invoices = D.invoices.filter((i) => match(i.id) || match(i.vendorRef) || match(vendorById[i.vendorId].name)).slice(0, 4);
    const vendors = D.vendors.filter((v) => match(v.name) || match(v.id)).slice(0, 4);
    const customers = D.customers.filter((c) => match(c.name) || match(c.id)).slice(0, 3);
    const group = (label, items) => (items.length ? `<h6>${label}</h6>${items.join('')}` : '');
    box.innerHTML = (group(T('searchInvoices'), invoices.map((i) => `<button data-action="search-open" data-kind="invoice" data-id="${esc(i.id)}"><span><strong>${esc(i.id)}</strong> · ${latin(vendorById[i.vendorId].name)}</span><span class="muted num">${esc(compact(i.amountQar))}</span></button>`)) +
      group(T('searchVendors'), vendors.map((v) => `<button data-action="search-open" data-kind="vendor" data-id="${esc(v.id)}"><span><strong>${latin(v.name)}</strong></span><span class="muted">${esc(v.id)}</span></button>`)) +
      group(T('searchCustomers'), customers.map((c) => `<button data-action="search-open" data-kind="customer" data-id="${esc(c.id)}"><span><strong>${latin(c.name)}</strong></span><span class="muted">${esc(c.id)}</span></button>`))) || `<div class="search-empty">${T('searchNoMatch')}</div>`;
    box.hidden = false;
  }
  function openSearchResult(kind, id) {
    const box = $('#searchResults');
    box.hidden = true;
    $('#globalSearch').value = '';
    if (kind === 'invoice') go('payables', { kind, id });
    else if (kind === 'vendor') go('vendors', { kind, id });
    else {
      const c = customerById[id];
      if (!inScope(c.entity)) {
        state.entity = 'ALL';
        $('#entitySelect').value = 'ALL';
      }
      Object.assign(state.ar, { q: c.name, status: 'all', page: 1 });
      go('receivables');
    }
  }

  /* ---------- Sign-in experience ---------- */
  function splashHtml(signedOut) {
    const body = signedOut
      ? `<h1>${T('signedOutTitle')}</h1><p>${T('signedOutBody')}</p><div><button class="btn primary" data-action="sign-in">${T('signInAgain')}</button></div>`
      : `<h1>${T('splashWelcome')}</h1><p>${T('splashBody')}</p><div class="splash-account">${avatar(persona)}<div><strong>${esc(nm(persona))}</strong><div class="small muted ltr">${esc(persona.account)}</div></div></div><div class="splash-bar"><span></span></div>`;
    return `<div class="splash-panel">${logoMark('mark-lg')}<p class="splash-word">${T('orgLine1')}</p><p class="splash-sub">${T('orgLine2')} · ${T('appName')}</p>${body}<div class="splash-note">${icon('lock')}<span>${T('splashSecure')}</span></div></div>` +
      `<div class="splash-hero">${serration('serration')}${starsArt('stars')}<div class="eyebrow">${T('splashEyebrow')}</div><h2>${T('splashHeroTitle')}</h2><p>${T('splashHeroBody')}</p></div>`;
  }
  function showSplash() {
    const splash = $('#splash');
    splash.innerHTML = splashHtml(false);
    splash.classList.remove('hide');
    splash.hidden = false;
    setTimeout(() => {
      splash.classList.add('hide');
      if (session) session.setItem('ath.session', '1');
      setTimeout(() => { splash.hidden = true; }, 480);
    }, 1700);
  }
  function signOut() {
    closeAll();
    if (session) session.removeItem('ath.session');
    const splash = $('#splash');
    splash.innerHTML = splashHtml(true);
    splash.classList.remove('hide');
    splash.hidden = false;
    $('#app').hidden = true;
  }
  function signIn() {
    recordActivity('signin', 'session', 'SSO · Kerberos');
    renderRoute();
    $('#app').hidden = false;
    showSplash();
  }

  /* ---------- Event wiring ---------- */
  const ACTIONS = {
    'toggle-lang': () => {
      state.lang = isAr() ? 'en' : 'ar';
      remember('ath.lang', state.lang);
      closeAll();
      renderShell();
      renderRoute();
    },
    'toggle-notifications': (el) => togglePopover('notifications', el),
    'toggle-user': (el) => togglePopover('user', el),
    'mark-read': () => { state.unread = 0; updateBell(); closePopover(); },
    profile: () => { closePopover(); openProfile(); },
    about: () => { closePopover(); openAbout(); },
    'sign-out': () => signOut(),
    'sign-in': () => signIn(),
    refresh: () => {
      if (session) session.setItem('ath.refreshed', '1');
      window.location.reload();
    },
    filter: (el) => {
      const s = state[el.dataset.scope];
      s[el.dataset.key] = el.dataset.value;
      s.page = 1;
      renderRoute();
    },
    'approval-tab': (el) => { state.approvalTab = el.dataset.value; renderRoute(); },
    sort: (el) => {
      const s = state[el.dataset.scope];
      if (s.sort === el.dataset.key) s.dir = -s.dir;
      else { s.sort = el.dataset.key; s.dir = 1; }
      refreshTable(el.dataset.scope);
    },
    page: (el) => {
      state[el.dataset.scope].page += Number(el.dataset.delta);
      refreshTable(el.dataset.scope);
    },
    'open-invoice': (el) => openInvoice(el.dataset.id),
    'open-vendor': (el) => openVendor(el.dataset.id),
    review: (el) => review(el.dataset.id),
    decide: (el) => confirmDecision(el.dataset.id, el.dataset.decision),
    'modal-confirm': (el) => {
      const run = state.modalConfirm;
      if (!run || el.disabled) return;
      const outcome = run();
      if (outcome && typeof outcome.then === 'function') {
        // Server round-trip: keep the dialog open (button disabled) until it succeeds; on failure the error is toasted.
        const modal = overlays.modal;
        el.disabled = true;
        outcome.then((ok) => {
          if (overlays.modal !== modal) return;
          if (ok) closeModal();
          else el.disabled = false;
        }, () => { el.disabled = false; });
      } else if (outcome !== false) closeModal();
    },
    'close-modal': () => closeModal(),
    'close-drawer': () => closeDrawer(),
    'hold-invoice': (el) => { if (!el.disabled) holdInvoice(el.dataset.id, true, el); },
    'release-invoice': (el) => { if (!el.disabled) holdInvoice(el.dataset.id, false, el); },
    'view-doc': (el) => viewDocument(el.dataset.id, el.dataset.kind),
    export: (el) => exportCsv(el.dataset.what),
    report: (el) => runReport(el.dataset.id),
    'new-transfer': () => openTransfer(),
    'search-open': (el) => openSearchResult(el.dataset.kind, el.dataset.id)
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    const pop = overlays.popover;
    if (pop && !pop.el.contains(target) && !pop.trigger.contains(target)) closePopover();
    const results = $('#searchResults');
    if (results && !results.hidden && !target.closest('.search')) results.hidden = true;
    const el = target.closest('[data-action]');
    if (!el || !has(ACTIONS, el.dataset.action)) return;
    event.preventDefault();
    ACTIONS[el.dataset.action](el, event);
  });
  let searchTimer = null;
  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.id === 'globalSearch') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(el.value), 120);
      return;
    }
    if (el.tagName === 'INPUT' && el.dataset.input) {
      state[el.dataset.input][el.dataset.key] = el.value;
      state[el.dataset.input].page = 1;
      refreshTable(el.dataset.input);
    }
  });
  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'entitySelect') {
      state.entity = el.value;
      remember('ath.entity', el.value);
      ['ap', 'ar', 'vendors', 'audit'].forEach((scope) => { state[scope].page = 1; });
      renderRoute();
      return;
    }
    if (el.tagName === 'SELECT' && el.dataset.input) {
      state[el.dataset.input][el.dataset.key] = el.value;
      state[el.dataset.input].page = 1;
      refreshTable(el.dataset.input);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (overlays.modal) closeModal();
      else if (overlays.drawer) closeDrawer();
      else if (overlays.popover) closePopover();
      else if ($('#searchResults')) $('#searchResults').hidden = true;
    } else if (event.key === 'Enter' && event.target.id === 'globalSearch') {
      const first = $('#searchResults button');
      if (first) first.click();
    }
  });
  window.addEventListener('hashchange', () => {
    closeAll();
    renderRoute();
    window.scrollTo(0, 0);
  });
  window.addEventListener('resize', closePopover);

  /* ---------- Start ---------- */
  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/svg+xml';
  favicon.href = 'data:image/svg+xml,' + encodeURIComponent(logoMark(''));
  document.head.appendChild(favicon);

  const freshSession = !(session && session.getItem('ath.session') === '1');
  if (freshSession) recordActivity('signin', 'session', 'SSO · Kerberos');
  renderShell();
  renderRoute();
  $('#app').hidden = false;
  if (freshSession) showSplash();
  else $('#splash').hidden = true;
  if (session && session.getItem('ath.refreshed')) {
    session.removeItem('ath.refreshed');
    toast(t('refreshed'));
  }
})();
