// Pure helpers for SqueekVision. Nothing here touches the DOM, so the
// functions can be exercised in Node by tests/lib.test.mjs.

export const API_BASE = 'https://api.squeekchain.com/v1';
export const REFRESH_MS = 15000;
export const REQUEST_TIMEOUT_MS = 10000;
export const RANGES = ['now', '24h', '7d'];
export const ETHERSCAN = 'https://sepolia.etherscan.io';
export const DASH = '–';

/**
 * @param {unknown} v
 * @returns {v is Record<string, any>}
 */
export function isObj(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * First non-null value among the given keys.
 * @param {unknown} obj
 * @param {string[]} keys
 * @returns {any}
 */
export function pick(obj, keys) {
  if (!isObj(obj)) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/**
 * @param {unknown} v
 * @returns {number | null}
 */
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** @param {unknown} v */
export function formatInt(v) {
  const n = toNum(v);
  return n === null ? DASH : intFmt.format(n);
}

/** @param {unknown} v */
export function formatDec(v) {
  const n = toNum(v);
  return n === null ? DASH : decFmt.format(n);
}

/** @param {string} s */
function groupDigits(s) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a raw integer token amount (string of base units) using decimals.
 * Returns null when the value is missing.
 * @param {unknown} raw
 * @param {number | null} decimals
 * @returns {string | null}
 */
export function formatUnits(raw, decimals) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    const n = toNum(s);
    return n === null ? null : decFmt.format(n);
  }
  const d = typeof decimals === 'number' && Number.isInteger(decimals) && decimals > 0 ? decimals : 0;
  if (d === 0) return groupDigits(s.replace(/^0+(?=\d)/, ''));
  const padded = s.padStart(d + 1, '0');
  const whole = padded.slice(0, padded.length - d).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(padded.length - d, padded.length - d + 2).replace(/0+$/, '');
  return groupDigits(whole) + (frac && whole.length < 7 ? '.' + frac : '');
}

/**
 * Ratio of two raw integer amounts as a percentage, or null.
 * @param {unknown} part
 * @param {unknown} whole
 */
export function percentOf(part, whole) {
  const p = toNum(part);
  const w = toNum(whole);
  if (p === null || w === null || w <= 0) return null;
  return clamp((p / w) * 100, 0, 100);
}

/**
 * Turn an API reason code into a readable sentence.
 * @param {unknown} code
 */
export function humanReason(code) {
  if (typeof code !== 'string' || code === '') return '';
  /** @type {Record<string, string>} */
  const known = {
    no_measurement: 'No wheel measurement has been reported yet.',
    not_yet_safe: 'Waiting for enough Sepolia confirmations.',
  };
  if (known[code]) return known[code];
  const words = code.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1) + '.';
}

/**
 * Parse an ISO date or a unix timestamp (seconds or milliseconds).
 * @param {unknown} v
 * @returns {Date | null}
 */
export function toDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = toNum(v);
  if (n !== null) {
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {Date} d */
export function formatTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** @param {Date} d */
export function formatDateTime(d) {
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** @param {Date} d */
export function formatHour(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** @param {unknown} v */
export function isAddress(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/** @param {unknown} v */
export function isTxHash(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** @param {string} a */
export function shortHex(a) {
  return a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
}

/** @param {string} a */
export function addressUrl(a) {
  return ETHERSCAN + '/address/' + a;
}

/** @param {string} h */
export function txUrl(h) {
  return ETHERSCAN + '/tx/' + h;
}

/**
 * Read the Squeektoshi wheel from GET /v1/status. The live API returns
 * `measurement: null` until the wheel reports; field names inside a
 * measurement are matched against a few likely spellings.
 * @param {any} status
 */
export function readWheel(status) {
  const m = isObj(status) && isObj(status.measurement) ? status.measurement : null;
  const rpm = toNum(pick(m, ['rpm', 'wheelRpm', 'revolutionsPerMinute']));
  let speedKmh = toNum(pick(m, ['speedKmh', 'speedKph', 'speed']));
  const speedMps = toNum(pick(m, ['speedMetersPerSecond', 'speedMps']));
  if (speedKmh === null && speedMps !== null) speedKmh = speedMps * 3.6;
  let distanceM = toNum(pick(m, ['distanceMeters', 'distanceM', 'distance']));
  const distanceKm = toNum(pick(m, ['distanceKm']));
  if (distanceM === null && distanceKm !== null) distanceM = distanceKm * 1000;

  let running = false;
  if (m) {
    const flag = pick(m, ['running', 'isRunning']);
    const state = pick(m, ['state', 'status']);
    if (typeof flag === 'boolean') running = flag;
    else if (typeof state === 'string') running = state.toLowerCase() === 'running';
    else running = rpm !== null && rpm > 0;
  }
  const builder = isObj(status) && isObj(status.builder) ? status.builder : null;
  return {
    hasMeasurement: m !== null,
    running,
    rpm,
    speedKmh,
    distanceM,
    measuredAt: toDate(pick(m, ['measuredAt', 'observedAt', 'timestamp', 'at'])),
    reason: m ? '' : humanReason(pick(builder, ['reason']) || 'no_measurement'),
  };
}

/** @param {number | null} m */
export function formatDistance(m) {
  if (m === null) return DASH;
  if (m >= 1000) return decFmt.format(m / 1000) + ' km';
  return intFmt.format(m) + ' m';
}

/** @param {number | null} kmh */
export function formatSpeed(kmh) {
  return kmh === null ? DASH : decFmt.format(kmh) + ' km/h';
}

/**
 * Percent of the next block completed, from settlementQueue.projected.
 * `blockProgress` is read as thousandths of a block (the API sizes work in
 * `workPerThousandBlocks`); a decimal value at or below 1 is read as a fraction.
 * @param {any} projected
 * @returns {number | null}
 */
export function blockProgressPercent(projected) {
  const raw = pick(projected, ['blockProgress']);
  const n = toNum(raw);
  if (n === null) return null;
  const isFraction = typeof raw === 'string' ? raw.includes('.') && n <= 1 : n > 0 && n < 1;
  return clamp(isFraction ? n * 100 : n / 10, 0, 100);
}

/** @param {any} status */
export function readQueue(status) {
  const q = isObj(status) && isObj(status.settlementQueue) ? status.settlementQueue : null;
  const projected = q && isObj(q.projected) ? q.projected : null;
  const buffered = q && isObj(q.buffered) ? q.buffered : null;
  return {
    available: q !== null,
    state: typeof pick(q, ['state']) === 'string' ? q.state : null,
    enabled: q ? q.settlementEnabled === true : false,
    incidentOpen: q ? q.incidentOpen === true : false,
    blockedReason: humanReason(pick(q, ['blockedReason'])),
    percent: blockProgressPercent(projected),
    blockHeight: pick(projected, ['blockHeight']),
    completedBlocks: pick(projected, ['completedBlockCount']),
    roundCount: pick(buffered, ['roundCount']),
    workUnits: pick(buffered, ['workUnits']),
  };
}

/**
 * $SQK supply from GET /v1/economy/state. `supply` is null until the token
 * contract is safe-confirmed; the token capability explains why.
 * @param {any} economy
 */
export function readSupply(economy) {
  const s = isObj(economy) && isObj(economy.supply) ? economy.supply : null;
  const asset = isObj(economy) && isObj(economy.asset) ? economy.asset : null;
  const decimals = toNum(pick(asset, ['decimals'])) ?? toNum(pick(s, ['decimals']));
  const minted = pick(s, ['minted', 'totalMinted', 'mintedSupply', 'totalSupply']);
  const circulating = pick(s, ['circulating', 'circulatingSupply']);
  const maxCap = pick(s, ['maxSupply', 'maxCap', 'cap', 'supplyCap', 'hardCap']);
  const token = isObj(economy) && isObj(economy.capabilities) ? economy.capabilities.token : null;
  return {
    published: s !== null,
    symbol: String(pick(asset, ['symbol']) || 'SQK'),
    minted: formatUnits(minted, decimals),
    circulating: formatUnits(circulating, decimals),
    maxCap: formatUnits(maxCap, decimals),
    mintedPercent: percentOf(minted, maxCap),
    tokenStatus: typeof pick(token, ['status']) === 'string' ? token.status : null,
    reason: humanReason(pick(token, ['reason'])),
  };
}

/** @type {Record<string, string>} */
const CONTRACT_LABELS = {
  core: 'Core',
  collection: 'Squeektoshi collection',
  launch: 'Launch',
  dispenser: 'Dispenser',
  token: '$SQK token',
  miningFactory: 'Mining factory',
  mining: 'Mining',
  staking: 'Staking',
};

/** @param {string} key */
function labelFor(key) {
  if (CONTRACT_LABELS[key]) return CONTRACT_LABELS[key];
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Contract and authority addresses from the deployment record in
 * GET /v1/economy/state. Only well-formed addresses are returned.
 * @param {any} economy
 */
export function readContracts(economy) {
  const dep = isObj(economy) && isObj(economy.deployment) ? economy.deployment : null;
  const caps = isObj(economy) && isObj(economy.capabilities) ? economy.capabilities : {};
  /** @type {{key: string, label: string, address: string, status: string | null}[]} */
  const contracts = [];
  const components = dep && isObj(dep.components) ? dep.components : {};
  for (const [key, c] of Object.entries(components)) {
    if (!isObj(c) || !isAddress(c.address)) continue;
    const cap = isObj(caps[key]) ? caps[key] : null;
    contracts.push({
      key,
      label: labelFor(key),
      address: c.address,
      status: cap && typeof cap.status === 'string' ? cap.status : null,
    });
  }
  /** @type {{key: string, label: string, address: string, status: string | null}[]} */
  const authority = [];
  const auth = dep && isObj(dep.authority) ? dep.authority : {};
  /** @type {[string, string, unknown][]} */
  const roles = [
    ['timelock', 'Governance timelock', isObj(auth.timelock) ? auth.timelock.address : null],
    ['proposer', 'Proposer Safe', isObj(auth.proposer) ? auth.proposer.address : null],
    ['guardian', 'Guardian', isObj(auth.guardian) ? auth.guardian.address : null],
    ['reporter', 'Reporter', auth.reporter],
    ['relayer', 'Relayer', auth.relayer],
  ];
  for (const [key, label, address] of roles) {
    if (isAddress(address)) authority.push({ key, label, address: String(address), status: null });
  }
  return { contracts, authority };
}

/**
 * One settlement row. The live API has returned an empty list so far, so
 * fields are matched against likely names and missing values show a dash.
 * @param {any} row
 */
export function readSettlement(row) {
  const first = pick(row, ['firstRound']);
  const last = pick(row, ['lastRound']);
  let round = pick(row, ['round', 'roundId']);
  if (round === undefined && first !== undefined) {
    round = last !== undefined && String(last) !== String(first) ? first + '–' + last : first;
  }
  const tx = pick(row, ['transactionHash', 'txHash', 'hash']);
  return {
    at: toDate(pick(row, ['settledAt', 'submittedAt', 'confirmedAt', 'blockTimestamp', 'timestamp', 'createdAt'])),
    round: round === undefined ? DASH : String(round),
    work: formatInt(pick(row, ['workAdded', 'workUnits', 'work'])),
    blocks: formatInt(pick(row, ['completedBlockCount', 'blockCount', 'blocks'])),
    tx: isTxHash(tx) ? String(tx) : null,
  };
}

/**
 * Bars for the activity chart from settlement buckets.
 * @param {any} payload
 */
export function readBuckets(payload) {
  const list = isObj(payload) && Array.isArray(payload.buckets) ? payload.buckets : [];
  const bars = [];
  for (const b of list) {
    const start = toDate(pick(b, ['startAt']));
    if (!start) continue;
    bars.push({
      start,
      settlements: toNum(pick(b, ['settlementCount'])) ?? 0,
      work: toNum(pick(b, ['workAdded'])) ?? 0,
    });
  }
  const max = bars.reduce((m, b) => Math.max(m, b.settlements), 0);
  const total = bars.reduce((t, b) => t + b.settlements, 0);
  const seconds = isObj(payload) && isObj(payload.window) ? toNum(payload.window.bucketSeconds) : null;
  return { bars, max, total, bucketSeconds: seconds };
}

/** @param {string} range */
export function settlementsUrl(range) {
  return API_BASE + '/settlements?range=' + encodeURIComponent(range);
}

/** @param {string} range */
export function rangeLabel(range) {
  if (range === 'now') return 'right now';
  if (range === '24h') return 'in the last 24 hours';
  if (range === '7d') return 'in the last 7 days';
  return '';
}
