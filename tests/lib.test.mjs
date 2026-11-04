// Unit tests for the data mapping in src/lib.js. Run with: npm test
// Fixtures mirror the shapes the live API returned on 2026-11-04 (empty
// measurement, null supply) plus populated variants for the running state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockProgressPercent,
  formatUnits,
  readBuckets,
  readContracts,
  readQueue,
  readSettlement,
  readSupply,
  readWheel,
  settlementsUrl,
  DASH,
} from '../src/lib.js';

const ADDR = '0xd78a3956cf63164d1fa1c622ad3c66623162fa1e';

test('wheel is idle with a reason when no measurement exists', () => {
  const w = readWheel({ measurement: null, builder: { status: 'unavailable', reason: 'no_measurement' } });
  assert.equal(w.hasMeasurement, false);
  assert.equal(w.running, false);
  assert.equal(w.rpm, null);
  assert.match(w.reason, /No wheel measurement/);
});

test('wheel reads rpm, speed and distance from a measurement', () => {
  const w = readWheel({ measurement: { rpm: '84', speedMetersPerSecond: 0.5, distanceMeters: '1520' } });
  assert.equal(w.running, true);
  assert.equal(w.rpm, 84);
  assert.equal(w.speedKmh, 1.8);
  assert.equal(w.distanceM, 1520);
});

test('explicit running flag wins over rpm', () => {
  assert.equal(readWheel({ measurement: { rpm: 10, running: false } }).running, false);
  assert.equal(readWheel({ measurement: { state: 'running' } }).running, true);
});

test('block progress is thousandths of a block, clamped', () => {
  assert.equal(blockProgressPercent({ blockProgress: '0' }), 0);
  assert.equal(blockProgressPercent({ blockProgress: '625' }), 62.5);
  assert.equal(blockProgressPercent({ blockProgress: '0.25' }), 25);
  assert.equal(blockProgressPercent({ blockProgress: '5000' }), 100);
  assert.equal(blockProgressPercent({}), null);
});

test('queue maps the live disabled state', () => {
  const q = readQueue({
    settlementQueue: {
      state: 'disabled', settlementEnabled: false, incidentOpen: false, blockedReason: null,
      buffered: { roundCount: '0', workUnits: '0' },
      projected: { blockHeight: '0', blockProgress: '0', completedBlockCount: '0' },
    },
  });
  assert.equal(q.enabled, false);
  assert.equal(q.state, 'disabled');
  assert.equal(q.percent, 0);
  assert.equal(q.blockHeight, '0');
});

test('token amounts format with decimals', () => {
  assert.equal(formatUnits('1500000000000000000', 18), '1.5');
  assert.equal(formatUnits('21000000000000000000000000', 18), '21,000,000');
  assert.equal(formatUnits('12345', 0), '12,345');
  assert.equal(formatUnits(null, 18), null);
});

test('supply is unpublished when the API returns null', () => {
  const s = readSupply({ supply: null, capabilities: { token: { status: 'unavailable', reason: 'not_yet_safe' } } });
  assert.equal(s.published, false);
  assert.equal(s.minted, null);
  assert.match(s.reason, /confirmations/);
});

test('supply reads minted, circulating and cap', () => {
  const s = readSupply({ asset: { symbol: 'SQK', decimals: 18 }, supply: { minted: '2000000000000000000000', circulating: '1000000000000000000000', maxSupply: '8000000000000000000000' } });
  assert.equal(s.minted, '2,000');
  assert.equal(s.circulating, '1,000');
  assert.equal(s.maxCap, '8,000');
  assert.equal(s.mintedPercent, 25);
});

test('contracts come from the deployment record and skip bad addresses', () => {
  const c = readContracts({
    deployment: {
      components: { token: { address: ADDR }, launch: null, core: { address: 'nope' } },
      authority: { timelock: { address: ADDR }, reporter: ADDR },
    },
    capabilities: { token: { status: 'unavailable' } },
  });
  assert.deepEqual(c.contracts.map((x) => x.key), ['token']);
  assert.equal(c.contracts[0].label, '$SQK token');
  assert.equal(c.contracts[0].status, 'unavailable');
  assert.deepEqual(c.authority.map((x) => x.key), ['timelock', 'reporter']);
});

test('settlement rows fall back to a dash', () => {
  const r = readSettlement({ firstRound: '3', lastRound: '5', workAdded: '1200', transactionHash: '0x' + 'a'.repeat(64) });
  assert.equal(r.round, '3–5');
  assert.equal(r.work, '1,200');
  assert.equal(r.blocks, DASH);
  assert.ok(r.tx);
  assert.equal(readSettlement({ transactionHash: '0x12' }).tx, null);
});

test('buckets become bars with max and total', () => {
  const b = readBuckets({
    window: { bucketSeconds: 3600 },
    buckets: [
      { startAt: '2026-11-04T10:00:00.000Z', settlementCount: '2' },
      { startAt: '2026-11-04T11:00:00.000Z', settlementCount: '5' },
      { startAt: 'bad' },
    ],
  });
  assert.equal(b.bars.length, 2);
  assert.equal(b.max, 5);
  assert.equal(b.total, 7);
  assert.equal(b.bucketSeconds, 3600);
  assert.equal(readBuckets({ buckets: [] }).bars.length, 0);
});

test('settlements URL carries the range', () => {
  assert.equal(settlementsUrl('7d'), 'https://api.squeekchain.com/v1/settlements?range=7d');
});
