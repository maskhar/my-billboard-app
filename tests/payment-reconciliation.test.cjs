require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'Node', target: 'ES2022', esModuleInterop: true } });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { Prisma } = require('@prisma/client');
const originalLoad = Module._load;
let routeDb;
Module._load = function (specifier, parent, isMain) {
  if (specifier === 'server-only') return {};
  if (specifier === './prisma') return { prisma: {} };
  if (specifier === '@/lib/prisma') return { prisma: { $transaction: (work) => routeDb.$transaction(work) } };
  if (specifier === 'next-auth') return { getServerSession: async () => ({ user: { id: 'admin', role: 'ADMIN' } }) };
  if (specifier === '@/lib/auth') return { authOptions: {} };
  if (specifier === '@/lib/mail') return { sendEmail: async () => {}, judulSurat: () => '' };
  if (specifier.startsWith('@/')) specifier = path.resolve(__dirname, '../src', specifier.slice(2));
  return originalLoad.call(this, specifier, parent, isMain);
};
let prepare, gateway, addCharge;
try {
  prepare = require('../src/lib/sesi-pembayaran.ts').siapkanSesiPembayaran;
  gateway = require('../src/lib/xendit.ts');
  addCharge = require('../src/app/api/admin/orders/add-charge/route.ts').POST;
} finally { Module._load = originalLoad; }

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof Prisma.Decimal) return value.equals(row[key]);
    return row[key] === value;
  });
}
function fixture() {
  let now = new Date('2030-01-01T00:00:00Z');
  const row = { id: 'payment', tujuan: 'TAMBAHAN', status: 'PENDING', jumlah: new Prisma.Decimal(100000), providerSessionId: null, providerReferenceId: null, sesiClaimToken: null, createdAt: now };
  const session = { payment_session_id: 'session', reference_id: 'pay_payment', customer_id: 'customer', amount: 100000, status: 'ACTIVE', mode: 'COMPONENTS', components_sdk_key: 'key', expires_at: '2030-01-01T00:30:00Z', payment_id: null };
  const state = { calls: 0, row, session, beforeClaim: null, beforeSave: null };
  const deps = {
    sekarang: () => now, tokenBaru: () => 'claim',
    db: {
      booking: { findFirst: async () => ({ id: 'booking', status: 'PAID_CONFIRMED', expiresAt: null, payments: [{ ...row }] }) },
      user: { findUnique: async () => ({ id: 'user', name: 'Customer', email: 'test@example.com', whatsapp: '081234567890', xenditCustomerId: 'customer' }) },
      payment: {
        updateMany: async ({ where, data }) => {
          if (data.sesiClaimToken && state.beforeClaim) state.beforeClaim();
          if (data.providerSessionId && state.beforeSave) state.beforeSave();
          if (!matches(row, where)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
      },
    },
    gerbang: {
      buatSesiPembayaran: async () => { state.calls++; if (state.error) throw state.error; return session; },
      ambilSesiAktifUntukKomponen: async () => ({ keadaan: state.condition ?? 'AKTIF', sesi: session }),
    },
  };
  return Object.assign(state, { deps, advance: () => { now = new Date(now.getTime() + 121000); }, run: (extra = {}) => prepare({ bookingId: 'booking', userId: 'user', ...extra }, deps) });
}

for (const error of [new gateway.GalatXendit(0, 'BATAS_WAKTU', 'timeout'), new gateway.GalatXendit(502, 'UPSTREAM', 'failed'), new gateway.GalatXendit(0, 'SESI_TIDAK_SESUAI', 'invalid'), new Error('unexpected')]) {
  test(`unknown outcome remains blocked after lease: ${error.message}`, async () => {
    const state = fixture(); state.error = error;
    await assert.rejects(state.run()); state.advance();
    await assert.rejects(state.run(), { kode: 'SESI_BELUM_PASTI' });
    assert.equal(state.calls, 1); assert.equal(state.row.sesiClaimToken, 'claim');
  });
}
test('incomplete successful response retains claim', async () => {
  const state = fixture(); state.session.components_sdk_key = null;
  await assert.rejects(state.run(), { kode: 'SESI_TIDAK_LENGKAP' });
  state.advance(); await assert.rejects(state.run()); assert.equal(state.calls, 1);
});
test('definitive rejection releases claim for corrected retry', async () => {
  const state = fixture(); state.error = new gateway.GalatXendit(422, 'INVALID_AMOUNT', 'rejected');
  await assert.rejects(state.run()); assert.equal(state.row.sesiClaimToken, null);
  state.error = null; await state.run(); assert.equal(state.calls, 2);
});
test('changed amount before claim prevents provider call', async () => {
  const state = fixture(); state.beforeClaim = () => { state.row.jumlah = new Prisma.Decimal(200000); };
  await assert.rejects(state.run()); assert.equal(state.calls, 0);
});
test('webhook wins persistence race: paid status and identity remain intact', async () => {
  const state = fixture(); state.beforeSave = () => { state.row.status = 'PAID'; state.row.providerSessionId = 'session'; };
  await assert.rejects(state.run()); assert.equal(state.row.status, 'PAID'); assert.equal(state.row.providerSessionId, 'session');
});
test('verified known session is reused without creating another session', async () => {
  const state = fixture(); state.error = new Error('lost response'); await assert.rejects(state.run());
  const result = await state.run({ sessionIdRekonsiliasi: 'session' });
  assert.equal(result.componentsSdkKey, 'key'); assert.equal(state.calls, 1); assert.equal(state.row.providerSessionId, 'session');
});
test('completed reconciliation waits for webhook without returning SDK key', async () => {
  const state = fixture(); state.row.sesiClaimToken = 'claim'; state.row.providerReferenceId = 'pay_payment'; state.condition = 'DIBAYAR';
  await assert.rejects(state.run({ sessionIdRekonsiliasi: 'session' }), { kode: 'MENUNGGU_KONFIRMASI' });
  assert.equal(state.calls, 0); assert.equal(state.row.providerSessionId, 'session');
});
test('unknown or wrong session cannot release claim', async () => {
  for (const condition of ['TIDAK_PASTI', 'AKTIF']) {
    const state = fixture(); state.row.sesiClaimToken = 'claim'; state.condition = condition;
    await assert.rejects(state.run({ sessionIdRekonsiliasi: 'wrong-session' }));
    assert.equal(state.calls, 0); assert.equal(state.row.providerSessionId, null);
  }
});
test('add-charge rejects active and expired unresolved claims; transaction rolls back', async () => {
  for (const race of [false, true]) {
    const state = fixture(); state.row.sesiClaimToken = race ? null : 'expired-claim';
    let rolledBack = false;
    routeDb = { $transaction: async (work) => {
      try { return await work({
        additionalCharge: { create: async () => ({}) },
        booking: { update: async () => ({ id: 'booking', status: 'PAID_CONFIRMED', additionalCharges: [{ amount: new Prisma.Decimal(110000) }], payments: [{ ...state.row }], user: null }) },
        payment: { updateMany: async ({ where }) => {
          if (where.expiresAt) return { count: 0 };
          if (race) state.row.sesiClaimToken = 'concurrent-claim';
          return { count: matches(state.row, where) ? 1 : 0 };
        } },
      }); } catch (error) { rolledBack = true; throw error; }
    } };
    const response = await addCharge(new Request('http://localhost/api/admin/orders/add-charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: 'booking', amount: 10000, description: 'Extra' }) }));
    assert.equal(response.status, 409); assert.equal(rolledBack, true); assert.equal(state.row.jumlah.toNumber(), 100000);
  }
});

test('gateway reconciliation verifies identity and never infers expiry from local time', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.XENDIT_SECRET_KEY;
  process.env.XENDIT_SECRET_KEY = 'test-key';
  try {
    const state = fixture();
    const expected = { referenceId: 'pay_payment', customerId: 'customer', nominal: 100000 };
    for (const change of [{ payment_session_id: 'other' }, { reference_id: 'other' }, { customer_id: 'other' }, { amount: 200000 }]) {
      global.fetch = async () => new Response(JSON.stringify({ ...state.session, ...change }), { status: 200 });
      await assert.rejects(gateway.ambilSesiAktifUntukKomponen('session', expected), { kodeGalat: 'SESI_TIDAK_SESUAI' });
    }
    global.fetch = async () => new Response(JSON.stringify({ ...state.session, expires_at: '2000-01-01T00:00:00Z' }), { status: 200 });
    assert.equal((await gateway.ambilSesiAktifUntukKomponen('session', expected)).keadaan, 'TIDAK_PASTI');
    global.fetch = async () => new Response(JSON.stringify({ ...state.session, status: 'EXPIRED', payment_id: 'paid' }), { status: 200 });
    assert.equal((await gateway.ambilSesiAktifUntukKomponen('session', expected)).keadaan, 'DIBAYAR');
    global.fetch = async () => new Response(JSON.stringify({ ...state.session, status: 'EXPIRED' }), { status: 200 });
    assert.equal((await gateway.ambilSesiAktifUntukKomponen('session', expected)).keadaan, 'MATI');
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.XENDIT_SECRET_KEY;
    else process.env.XENDIT_SECRET_KEY = originalKey;
  }
});
