const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const loader = source.slice(source.indexOf('async function loadCoinLedger()'), source.indexOf('async function loadAdjustmentCatalog()'));
const balance = source.slice(source.indexOf('function currentBalance('), source.indexOf('function getProfileName('));

function fixture(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1).padStart(8, '0'),
    family_id: 'family', player_id: i % 7 === 0 ? 'other' : 'mateo',
    amount: i % 11 === 0 ? -10 : 5,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()
  }));
}

function harness(rows, { cap = 1000, failAt = -1 } = {}) {
  let calls = 0;
  const client = { from(table) {
    assert.equal(table, 'coin_ledger');
    let family, cursor = null, end = 499;
    return {
      select() { return this; },
      eq(key, value) { assert.equal(key, 'family_id'); family = value; return this; },
      order(key, options) { assert.equal(key, 'id'); assert.equal(options.ascending, true); return this; },
      range(start, to) { assert.equal(start, 0); end = to; return this; },
      gt(key, value) { assert.equal(key, 'id'); cursor = value; return this; },
      then(resolve, reject) {
        const result = calls++ === failAt ? { error: new Error('network failure') } : {
          data: rows.filter(row => row.family_id === family && (cursor === null || row.id > cursor))
            .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, end + 1))
        };
        return Promise.resolve(result).then(resolve, reject);
      }
    };
  } };
  const context = vm.createContext({ supabaseClient: client, FAMILY_ID: 'family', currentUser: { id: 'mateo' } });
  vm.runInContext(`let coinLedger = [{ id: 'previous', player_id: 'mateo', amount: 123 }];\n${loader}\n${balance}`, context);
  return {
    load: () => context.loadCoinLedger(),
    coins: () => context.currentBalance('mateo'),
    entries: () => vm.runInContext('coinLedger', context),
    calls: () => calls
  };
}

for (const [size, cap] of [[0, 1000], [20, 1000], [1000, 1000], [2205, 1000], [1205, 137]]) {
  test(`complete balance: ${size} movements with API cap ${cap}`, async () => {
    const rows = fixture(size);
    rows.push({ ...fixture(1)[0], id: 'foreign', family_id: 'another-family', amount: 9999 });
    const h = harness(rows, { cap });
    await h.load();
    assert.equal(h.entries().length, size);
    assert.equal(h.coins(), rows.filter(r => r.family_id === 'family' && r.player_id === 'mateo').reduce((s, r) => s + r.amount, 0));
    assert.equal(new Set(h.entries().map(r => r.id)).size, size);
    for (let i = 1; i < size; i++) assert.ok(h.entries()[i - 1].created_at >= h.entries()[i].created_at);
  });
}

test('approval adds its full value after 1000 historical movements', async () => {
  const rows = fixture(1000).map(r => ({ ...r, player_id: 'mateo', amount: 5 }));
  rows[0].amount = 20;
  const h = harness(rows);
  await h.load();
  const before = h.coins();
  rows.push({ ...rows[0], id: '00001001', amount: 3, created_at: '2026-11-05T19:00:00Z' });
  // Original query sums only the 1000 newest rows: +3 displaces +20.
  const oldDisplayed = rows.slice(-1000).reduce((s, r) => s + r.amount, 0);
  assert.equal(oldDisplayed - before, -17);
  await h.load();
  assert.equal(h.coins() - before, 3);
});

test('page failure retains the previous complete balance', async () => {
  const h = harness(fixture(1500), { failAt: 1 });
  await assert.rejects(h.load(), /network failure/);
  assert.equal(h.coins(), 123);
  assert.equal(h.entries().length, 1);
});

test('equal timestamps retain every movement in deterministic order', async () => {
  const rows = fixture(1200).map(r => ({ ...r, created_at: '2026-11-05T19:00:00Z' }));
  const h = harness(rows);
  await h.load();
  assert.equal(h.entries().length, 1200);
  assert.equal(h.entries()[0].id, '00001200');
});
