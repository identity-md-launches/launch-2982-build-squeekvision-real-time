// SqueekVision: fetches the SqueekChain API every 15 seconds and renders it.
// All API text is written with textContent, never as HTML.
import {
  API_BASE,
  REFRESH_MS,
  REQUEST_TIMEOUT_MS,
  RANGES,
  DASH,
  addressUrl,
  formatDateTime,
  formatDec,
  formatDistance,
  formatHour,
  formatInt,
  formatSpeed,
  formatTime,
  rangeLabel,
  readBuckets,
  readContracts,
  readQueue,
  readSettlement,
  readSupply,
  readWheel,
  settlementsUrl,
  shortHex,
  txUrl,
} from './lib.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {(Node | string)[]} [children]
 */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
}

/** @param {string} id @param {string} text */
function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

/**
 * @param {string} badgeId
 * @param {string} labelId
 * @param {string} text
 * @param {'neutral' | 'positive' | 'warning' | 'negative'} tone
 */
function setBadge(badgeId, labelId, text, tone) {
  $(badgeId).dataset.tone = tone;
  setText(labelId, text);
}

/** @param {string} id @param {string} text @param {boolean} [error] */
function setNote(id, text, error = false) {
  const el = $(id);
  el.textContent = text;
  if (error) el.dataset.tone = 'negative';
  else delete el.dataset.tone;
}

/** @param {string} message */
function announce(message) {
  const el = $('announcer');
  el.textContent = '';
  window.setTimeout(() => { el.textContent = message; }, 50);
}

/**
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function getJson(url, signal) {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: timeout.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!res.ok) throw new Error('The API answered HTTP ' + res.status + '.');
    return await res.json();
  } catch (err) {
    if (signal.aborted) throw err;
    if (timeout.signal.aborted) throw new Error('The API did not answer within 10 seconds.');
    if (err instanceof SyntaxError) throw new Error('The API sent a response that is not JSON.');
    if (err instanceof TypeError) throw new Error('Could not reach api.squeekchain.com. Check your connection.');
    throw err;
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** @param {unknown} err */
function errorText(err) {
  return err instanceof Error ? err.message : 'Unknown error.';
}

// ---------------------------------------------------------------- render

/** @param {any} status */
function renderWheel(status) {
  const w = readWheel(status);
  if (!w.hasMeasurement) setBadge('wheel-badge', 'wheel-state', 'Idle', 'neutral');
  else if (w.running) setBadge('wheel-badge', 'wheel-state', 'Running', 'positive');
  else setBadge('wheel-badge', 'wheel-state', 'Idle', 'neutral');
  $('wheel-icon').dataset.running = String(w.running);
  setText('rpm', w.rpm === null ? DASH : formatDec(w.rpm) + ' rpm');
  setText('speed', formatSpeed(w.speedKmh));
  setText('distance', formatDistance(w.distanceM));
  if (!w.hasMeasurement) setNote('wheel-note', w.reason + ' Values appear when Squeektoshi starts running.');
  else if (w.measuredAt) setNote('wheel-note', 'Measured at ' + formatTime(w.measuredAt) + '.');
  else setNote('wheel-note', '');
}

/** @param {any} status */
function renderQueue(status) {
  const q = readQueue(status);
  if (!q.available) {
    setBadge('queue-badge', 'queue-state', 'Unavailable', 'negative');
  } else if (q.incidentOpen) {
    setBadge('queue-badge', 'queue-state', 'Incident open', 'negative');
  } else if (q.enabled) {
    setBadge('queue-badge', 'queue-state', 'Settling', 'positive');
  } else {
    setBadge('queue-badge', 'queue-state', q.state === 'disabled' ? 'Paused' : 'Waiting', 'warning');
  }
  const pct = q.percent ?? 0;
  const label = q.percent === null ? DASH : formatDec(pct) + '%';
  setText('block-pct', label);
  const bar = $('block-progress');
  bar.setAttribute('aria-valuenow', String(Math.round(pct * 10) / 10));
  bar.setAttribute('aria-valuetext', q.percent === null ? 'Not reported' : label + ' of the next block');
  bar.dataset.idle = String(!q.enabled || pct === 0);
  $('block-fill').style.transform = 'scaleX(' + pct / 100 + ')';
  setText('block-height', formatInt(q.blockHeight));
  setText('blocks-done', formatInt(q.completedBlocks));
  setText('rounds', formatInt(q.roundCount));
  if (q.blockedReason) setNote('block-note', q.blockedReason);
  else if (!q.enabled) setNote('block-note', 'Settlement is paused. Progress moves again when the queue is enabled.');
  else setNote('block-note', formatInt(q.workUnits) + ' work units are buffered for the next settlement.');
}

/** @param {any} economy */
function renderSupply(economy) {
  const s = readSupply(economy);
  if (s.published) setBadge('token-badge', 'token-state', 'Live', 'positive');
  else if (s.tokenStatus === 'unavailable') setBadge('token-badge', 'token-state', 'Pending', 'warning');
  else setBadge('token-badge', 'token-state', s.tokenStatus ? capitalize(s.tokenStatus) : 'Not published', 'neutral');
  setText('minted', s.minted ?? DASH);
  setText('circulating', s.circulating ?? DASH);
  setText('max-cap', s.maxCap ?? DASH);
  const pct = s.mintedPercent ?? 0;
  const bar = $('cap-progress');
  bar.setAttribute('aria-valuenow', String(Math.round(pct * 10) / 10));
  bar.setAttribute('aria-valuetext', s.mintedPercent === null ? 'Not published' : formatDec(pct) + '% of max cap minted');
  $('cap-fill').style.transform = 'scaleX(' + pct / 100 + ')';
  if (!s.published) {
    setNote('supply-note', 'Supply figures are not published yet. ' + (s.reason || ''));
  } else if (s.mintedPercent !== null) {
    setNote('supply-note', formatDec(pct) + '% of the max cap is minted. Amounts in ' + s.symbol + '.');
  } else {
    setNote('supply-note', 'Amounts in ' + s.symbol + '.');
  }
}

/** @param {string} s */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {any} payload
 * @param {string} range
 */
function renderSettlements(payload, range) {
  const summary = payload && typeof payload === 'object' ? payload.summary : null;
  setText('sum-count', formatInt(summary?.settlementCount));
  setText('sum-work', formatInt(summary?.workAdded));
  setText('sum-blocks', formatInt(summary?.completedBlockCount));
  setText('sum-active', formatInt(summary?.activeRoundCount));
  const rows = Array.isArray(payload?.recentSettlements) ? payload.recentSettlements : [];
  const body = $('settlement-rows');
  const frag = document.createDocumentFragment();
  for (const raw of rows) {
    const r = readSettlement(raw);
    const txCell = r.tx
      ? h('td', {}, [h('a', { class: 'mono', href: txUrl(r.tx), target: '_blank', rel: 'noopener', 'aria-label': 'Transaction ' + r.tx + ' on Etherscan', text: shortHex(r.tx) })])
      : h('td', { text: DASH });
    frag.append(h('tr', {}, [
      h('td', { text: r.at ? formatDateTime(r.at) : DASH }),
      h('td', { text: r.round }),
      h('td', { class: 'num', text: r.work }),
      h('td', { class: 'num', text: r.blocks }),
      txCell,
    ]));
  }
  body.replaceChildren(frag);
  $('settlements-panel').querySelector('.table-wrap')?.setAttribute('data-empty', String(rows.length === 0));
  if (rows.length === 0) {
    const status = payload?.status;
    const why = status && status !== 'available' ? ' The settlement feed reports ' + status + '.' : '';
    setNote('settlements-note', 'No settlements ' + rangeLabel(range) + '. New ones appear here on the next refresh.' + why);
  } else {
    const archived = Number(summary?.archivedSettlementCount ?? 0);
    setNote('settlements-note', 'Showing ' + rows.length + ' recent settlement' + (rows.length === 1 ? '' : 's') + (archived > 0 ? ', ' + formatInt(archived) + ' more archived.' : '.'));
  }
}

/** @param {any} payload */
function renderActivity(payload) {
  const { bars, max, total, bucketSeconds } = readBuckets(payload);
  const list = $('bars');
  const frag = document.createDocumentFragment();
  for (const b of bars) {
    const pct = max > 0 ? (b.settlements / max) * 100 : 0;
    const fill = h('span', { class: 'bar-fill', 'aria-hidden': 'true' });
    fill.style.height = pct + '%';
    frag.append(h('li', { class: 'bar', 'data-zero': String(b.settlements === 0) }, [
      fill,
      h('span', { class: 'visually-hidden', text: formatHour(b.start) + ': ' + formatInt(b.settlements) + ' settlements' }),
    ]));
  }
  list.replaceChildren(frag);
  const hourly = bucketSeconds === 3600 || bucketSeconds === null;
  list.setAttribute('aria-label', (hourly ? 'Settlements per hour' : 'Settlements per bucket') + ', last 24 hours');
  if (bars.length > 0) {
    setText('axis-start', formatHour(bars[0].start));
    setText('axis-mid', formatHour(bars[Math.floor(bars.length / 2)].start));
    setText('axis-end', formatHour(bars[bars.length - 1].start));
  } else {
    setText('axis-start', '');
    setText('axis-mid', '');
    setText('axis-end', '');
  }
  setText('activity-total', formatInt(total) + ' settlements in 24 hours');
  if (bars.length === 0) setNote('activity-note', 'The API returned no hourly buckets for the last 24 hours.');
  else if (total === 0) setNote('activity-note', 'No settlements in any hour of the last 24 hours, so every bar sits at zero.');
  else setNote('activity-note', 'Tallest bar: ' + formatInt(max) + ' settlements in one hour.');
}

/**
 * @param {HTMLElement} list
 * @param {{label: string, address: string, status: string | null}[]} items
 */
function renderAddressList(list, items) {
  const frag = document.createDocumentFragment();
  for (const c of items) {
    const name = h('span', { class: 'name' }, [h('span', { text: c.label })]);
    if (c.status) {
      name.append(h('span', { class: 'state', 'data-tone': c.status === 'verified' ? 'positive' : 'neutral', text: c.status === 'verified' ? 'Verified' : capitalize(c.status) }));
    }
    frag.append(h('li', {}, [
      name,
      h('a', { href: addressUrl(c.address), target: '_blank', rel: 'noopener', title: c.address, 'aria-label': c.label + ' ' + c.address + ' on Sepolia Etherscan', text: shortHex(c.address) }),
    ]));
  }
  list.replaceChildren(frag);
}

/** @param {any} economy */
function renderContracts(economy) {
  const { contracts, authority } = readContracts(economy);
  renderAddressList($('contracts'), contracts);
  renderAddressList($('authority'), authority);
  if (contracts.length + authority.length === 0) {
    setNote('contracts-note', 'The deployment record lists no contract addresses yet.');
  } else {
    setNote('contracts-note', 'Each address opens on Sepolia Etherscan in a new tab.');
  }
  const chain = economy?.chain;
  if (chain && chain.indexedThroughBlock) {
    setText('chain-meta', 'Indexed through Sepolia block ' + formatInt(chain.indexedThroughBlock) + '.');
  }
}

// ---------------------------------------------------------------- state

const state = {
  range: 'now',
  auto: true,
  inFlight: /** @type {AbortController | null} */ (null),
  nextAt: 0,
  timer: 0,
  lastSuccess: /** @type {Date | null} */ (null),
  lastError: '',
  /** @type {Record<string, any>} */
  cache: {},
};

/**
 * @param {string} section
 * @param {boolean} stale
 */
function markStale(section, stale) {
  for (const el of document.querySelectorAll('[data-section="' + section + '"]')) {
    if (stale) /** @type {HTMLElement} */ (el).dataset.stale = 'true';
    else delete /** @type {HTMLElement} */ (el).dataset.stale;
  }
}

function updateMeta() {
  const parts = [];
  if (state.lastSuccess) parts.push('Updated ' + formatTime(state.lastSuccess) + '.');
  else if (!state.lastError) parts.push('Loading live data…');
  if (state.lastError) parts.push(state.lastError);
  if (state.inFlight) parts.push('Refreshing…');
  else if (state.auto && state.nextAt) {
    const secs = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
    parts.push('Next refresh in ' + secs + ' s.');
  } else if (!state.auto) parts.push('Auto-refresh is off.');
  setText('updated', parts.join(' '));
}

/**
 * @param {{ manual?: boolean, onlySettlements?: boolean }} [opts]
 */
async function refresh(opts = {}) {
  // A tab switch during a full refresh must not drop the other panels.
  if (opts.onlySettlements && state.inFlight) opts = { manual: opts.manual };
  state.inFlight?.abort();
  const ctrl = new AbortController();
  state.inFlight = ctrl;
  window.clearTimeout(state.timer);
  const button = /** @type {HTMLButtonElement} */ ($('refresh'));
  button.setAttribute('aria-busy', 'true');
  updateMeta();

  const range = state.range;
  /** @type {Record<string, string>} */
  const jobs = { settlements: settlementsUrl(range) };
  if (!opts.onlySettlements) {
    jobs.status = API_BASE + '/status';
    jobs.economy = API_BASE + '/economy/state';
    if (range !== '24h') jobs.activity = settlementsUrl('24h');
  }
  const keys = Object.keys(jobs);
  const results = await Promise.allSettled(keys.map((k) => getJson(jobs[k], ctrl.signal)));
  if (ctrl.signal.aborted) return;

  /** @type {string[]} */
  const failures = [];
  /** @type {Record<string, any>} */
  const data = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') data[keys[i]] = r.value;
    else failures.push(errorText(r.reason));
  });
  if (data.settlements && range === '24h' && !opts.onlySettlements) data.activity = data.settlements;

  if ('status' in data) { renderWheel(data.status); renderQueue(data.status); }
  if ('economy' in data) { renderSupply(data.economy); renderContracts(data.economy); }
  if ('settlements' in data) renderSettlements(data.settlements, range);
  if ('activity' in data) renderActivity(data.activity);
  for (const k of keys) markStale(k, !(k in data) && k in state.cache);
  for (const [k, v] of Object.entries(data)) state.cache[k] = v;

  showFailures(keys, data, failures, range);

  if (failures.length < keys.length) state.lastSuccess = new Date();
  state.lastError = failures.length ? 'Last refresh failed. ' + failures[0] + ' Press Refresh now to try again.' : '';
  state.inFlight = null;
  button.removeAttribute('aria-busy');
  if (opts.manual) {
    announce(failures.length ? 'Refresh failed. ' + failures[0] : 'Dashboard updated at ' + formatTime(new Date()) + '.');
  }
  schedule();
}

/**
 * Put an error next to each panel that has never loaded.
 * @param {string[]} keys
 * @param {Record<string, any>} data
 * @param {string[]} failures
 * @param {string} range
 */
function showFailures(keys, data, failures, range) {
  if (!failures.length) return;
  // The full reason and the retry hint are shown once, in the header.
  for (const k of keys) {
    if (k in data || k in state.cache) continue;
    if (k === 'status') {
      setBadge('wheel-badge', 'wheel-state', 'No data', 'negative');
      setBadge('queue-badge', 'queue-state', 'No data', 'negative');
      setNote('wheel-note', 'Wheel status did not load.', true);
      setNote('block-note', 'Queue status did not load.', true);
    } else if (k === 'economy') {
      setBadge('token-badge', 'token-state', 'No data', 'negative');
      setNote('supply-note', 'Supply did not load.', true);
      setNote('contracts-note', 'Contract list did not load.', true);
    } else if (k === 'activity') {
      setNote('activity-note', 'Hourly activity did not load.', true);
    }
  }
  if (keys.includes('settlements') && !('settlements' in data)) {
    setNote('settlements-note', 'Settlements ' + rangeLabel(range) + ' did not load.', true);
  }
}

function schedule() {
  window.clearTimeout(state.timer);
  if (!state.auto) { state.nextAt = 0; updateMeta(); return; }
  state.nextAt = Date.now() + REFRESH_MS;
  state.timer = window.setTimeout(() => {
    if (document.visibilityState === 'hidden') { state.nextAt = 0; return; }
    refresh();
  }, REFRESH_MS);
  updateMeta();
}

// ---------------------------------------------------------------- tabs

/** @param {string} range @param {boolean} focus */
function selectRange(range, focus) {
  if (!RANGES.includes(range)) return;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const t = /** @type {HTMLElement} */ (tab);
    const on = t.dataset.range === range;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) {
      $('settlements-panel').setAttribute('aria-labelledby', t.id);
      if (focus) t.focus();
    }
  }
  if (state.range === range) return;
  state.range = range;
  delete state.cache.settlements;
  setNote('settlements-note', 'Loading settlements ' + rangeLabel(range) + '…');
  $('settlements-panel').querySelector('.table-wrap')?.setAttribute('data-empty', 'true');
  refresh({ onlySettlements: true });
}

function initTabs() {
  const tabs = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[role="tab"]')));
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectRange(tab.dataset.range || 'now', false));
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      selectRange(tabs[next].dataset.range || 'now', true);
    });
  }
}

// ---------------------------------------------------------------- boot

function init() {
  for (const [id, section] of [
    ['wheel-title', 'status'], ['block-title', 'status'], ['supply-title', 'economy'],
    ['settlements-title', 'settlements'], ['activity-title', 'activity'], ['contracts-title', 'economy'],
  ]) {
    $(id).closest('.card')?.setAttribute('data-section', section);
  }
  initTabs();
  $('refresh').addEventListener('click', () => refresh({ manual: true }));
  const auto = /** @type {HTMLInputElement} */ ($('auto'));
  auto.addEventListener('change', () => {
    state.auto = auto.checked;
    if (state.inFlight) { updateMeta(); return; }
    schedule();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.auto && !state.inFlight && state.nextAt === 0) refresh();
  });
  window.setInterval(() => { if (state.auto && !state.inFlight) updateMeta(); }, 1000);
  refresh();
}

init();
