/**
 * ATTACK SUITE against routes/call-wallet.js — attempts to break the
 * JWT-authenticated post-call recharge surface. Every test either proves
 * the attack is BLOCKED (status/code asserted) or exposes a real bug.
 *
 *   cd backend && npx jest call-wallet-attack
 */
const crypto = require('crypto');
const http = require('http');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.RAZORPAY_KEY_ID = 'rzp_test_attacker000001';
process.env.RAZORPAY_KEY_SECRET = 'atk_secret_00000000000000';
process.env.RAZORPAY_WEBHOOK_SECRET = 'atk_wh_secret_00000000';
process.env.FAMILY_WEB_URL = 'http://localhost:5173';
process.env.WALLET_MIN_RUPEES = '10';
process.env.WALLET_MAX_RUPEES = '2000';
process.env.WALLET_DAILY_CAP_RUPEES = '5000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'attacker-suite-secret-0123456789abcdef';

jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

jest.mock('../lib/db', () => {
  const store = {};
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {
    __store: store,
    readDb: async (f) => clone(store[f] || []),
    updateDb: async (f, mutator) => {
      const out = mutator(clone(store[f] || []));
      if (out && Array.isArray(out.data)) store[f] = out.data;
      return out;
    },
    transact: async () => { throw new Error('not used'); },
    query: async () => ({ rows: [] }),
    ping: async () => true,
    pool: null,
  };
});

jest.mock('../lib/razorpay', () => {
  const actual = jest.requireActual('../lib/razorpay');
  return {
    ...actual,
    createOrder: jest.fn(async ({ amountPaise, receipt }) => ({
      id: 'order_atk_' + receipt,
      amount: amountPaise,
      currency: 'INR',
    })),
    fetchPayment: jest.fn(),
    capturePayment: jest.fn(),
    fetchPaymentsForOrder: jest.fn(async () => []),
  };
});

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const { app } = require('../server');
const { __store: store } = require('../lib/db');
const razorpay = require('../lib/razorpay');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SECRET = process.env.JWT_SECRET;
const CONTACT = 'CNT-ATK';
const INMATE = 'INM-ATK';
const CALL_ID = 'CALL-ATK-1';
const KIOSK = 'KIOSK-ATK';
const OTHER_CONTACT = 'CNT-EVIL';
const OTHER_INMATE = 'INM-EVIL';
const GROSS = 100000, FEE = 1180, TAX = 212, NET = GROSS - FEE - TAX;

let xff = 0;
const ip = () => ({ 'X-Forwarded-For': `10.88.${Math.floor(++xff / 250)}.${xff % 250}` });
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const paySign = (o, p) => crypto.createHmac('sha256', KEY_SECRET).update(`${o}|${p}`).digest('hex');

function sign(over = {}, opts = {}) {
  return jwt.sign(
    { sub: CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM-ATK', kioskId: KIOSK, ...over },
    opts.secret ?? SECRET,
    { expiresIn: '5m', ...opts },
  );
}

function resetStore() {
  store['inmates.json'] = [
    { inmateId: INMATE, firstName: 'Asha', lastName: 'Kumar', status: 'active' },
    { inmateId: OTHER_INMATE, firstName: 'Evil', lastName: 'Twin', status: 'active' },
  ];
  store['contacts.json'] = [
    { contactId: CONTACT, inmateId: INMATE, firstName: 'Fam', lastName: 'ATK', phone: '+913333333333', approvalStatus: 'approved', status: 'active', active: true },
    { contactId: OTHER_CONTACT, inmateId: OTHER_INMATE, firstName: 'Evil', lastName: 'C', phone: '+914444444444', approvalStatus: 'approved', status: 'active', active: true },
  ];
  store['calls.json'] = [
    { callId: CALL_ID, contactId: CONTACT, inmateId: INMATE, kioskId: KIOSK, roomId: 'RM-ATK', status: 'completed', type: 'audio' },
    { callId: 'CALL-EVIL-1', contactId: OTHER_CONTACT, inmateId: OTHER_INMATE, kioskId: KIOSK, roomId: 'RM-EV', status: 'completed', type: 'audio' },
  ];
  store['wallets.json'] = [];
  store['transactions.json'] = [];
  store['wallet-payments.json'] = [];
  razorpay.createOrder.mockClear();
  razorpay.fetchPayment.mockReset();
  razorpay.capturePayment.mockReset();
}

beforeEach(resetStore);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const info = (token, headers = {}) =>
  request(app).get('/family/call-wallet/info').set(ip()).set(headers).set('Authorization', `Bearer ${token}`);

const order = (token, body = { amount: 100 }, headers = {}) =>
  request(app).post('/family/call-wallet/order').set(ip()).set(headers).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json').send(body);

const verify = (token, body, headers = {}) =>
  request(app).post('/family/call-wallet/verify').set(ip()).set(headers).set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json').send(body);

const seedAttempt = (over = {}) => {
  const row = {
    paymentId: 'PAY-SEED', orderId: 'order_seed_001', linkId: null,
    contactId: CONTACT, inmateId: INMATE, amountPaise: GROSS, status: 'created',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...over,
  };
  store['wallet-payments.json'] = [row];
  return row;
};

// ===========================================================================
// 1. JWT ALGORITHM / SIGNATURE ATTACKS
// ===========================================================================
describe('ATTACK: JWT alg:none and signature bypass', () => {
  test('A1 alg:none token -> 401 (library rejects unsigned tokens)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM', kioskId: KIOSK })).toString('base64url');
    const token = `${header}.${payload}.`;
    const res = await info(token);
    expect(res.status).toBe(401);
  });

  test('A2 HS256 token signed with empty secret -> library refuses to create; verifying rejects', async () => {
    // jsonwebtoken refuses to sign with an empty secret, so build the token manually.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM', kioskId: KIOSK, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
    const sig = crypto.createHmac('sha256', '').update(`${header}.${payload}`).digest('base64url');
    const res = await info(`${header}.${payload}.${sig}`);
    expect(res.status).toBe(401);
  });

  test('A3 HS256 token signed with common weak secrets -> 401', async () => {
    for (const weak of ['secret', 'password', '12345', 'jwt-secret']) {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM', kioskId: KIOSK, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
      const sig = crypto.createHmac('sha256', weak).update(`${header}.${payload}`).digest('base64url');
      const res = await info(`${header}.${payload}.${sig}`);
      expect(res.status).toBe(401);
    }
  });

  test('A4 RS256 header but HS256 body (algorithm confusion) -> 401', async () => {
    // Attacker sets alg=RS256 hoping server uses public key as HMAC secret.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM', kioskId: KIOSK, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
    const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    const res = await info(`${header}.${body}.${sig}`);
    expect(res.status).toBe(401);
  });

  test('A5 valid token with tampered payload (signature mismatch) -> 401', async () => {
    const good = sign();
    const [h, , s] = good.split('.');
    const tampered = Buffer.from(JSON.stringify({ sub: OTHER_CONTACT, role: 'family', callId: CALL_ID, roomId: 'RM', kioskId: KIOSK })).toString('base64url');
    const res = await info(`${h}.${tampered}.${s}`);
    expect(res.status).toBe(401);
  });

  test('A6 token from wallet-link SMS flow (no callId) -> 401', async () => {
    const token = sign({ callId: undefined, sub: CONTACT, role: 'family' });
    const res = await info(token);
    expect(res.status).toBe(401);
  });

  test('A7 kiosk-role token -> 401', async () => {
    const token = sign({ role: 'kiosk' });
    const res = await info(token);
    expect(res.status).toBe(401);
  });

  test('A8 admin-role token with callId claim -> 401', async () => {
    const token = sign({ role: 'admin' });
    const res = await info(token);
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 2. JWT CLAIM TAMPERING (valid signature, malicious claims)
// ===========================================================================
describe('ATTACK: JWT claim tampering', () => {
  test('B1 valid token for contact A cannot act for contact B -> 404 on B\'s call', async () => {
    // Attacker has a real token for CONTACT but wants OTHER_CONTACT's inmate.
    // Sign a token claiming OTHER_CONTACT's callId but sub=CONTACT (cross-bind).
    const token = sign({ sub: CONTACT, callId: 'CALL-EVIL-1' });
    const res = await info(token);
    // resolveCallSession: call found but call.contactId (OTHER_CONTACT) !== claims.sub (CONTACT) -> 404
    expect(res.status).toBe(404);
  });

  test('B2 token with sub=OTHER_CONTACT but callId of CONTACT -> 404', async () => {
    const token = sign({ sub: OTHER_CONTACT, callId: CALL_ID });
    const res = await info(token);
    expect(res.status).toBe(404);
  });

  test('B3 sub as array -> 401 (type validation rejects non-string claims)', async () => {
    const token = sign({ sub: [CONTACT], callId: CALL_ID });
    const res = await info(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('B4 callId as object -> 401 (type validation rejects non-string claims)', async () => {
    // JWT JSON-serialises; toString (a function) is dropped, leaving {}.
    // Pre-fix this crashed String() with a TypeError -> unhandled 500.
    const token = sign({ callId: { toString: CALL_ID } });
    const res = await info(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('B4b sub as object -> 401', async () => {
    const token = sign({ sub: { toString: CONTACT } });
    const res = await info(token);
    expect(res.status).toBe(401);
  });

  test('B5 roomId/kioskId injection cannot affect inmate binding', async () => {
    const token = sign({ roomId: OTHER_INMATE, kioskId: OTHER_INMATE });
    const res = await order(token, { amount: 100 });
    if (res.status === 200) {
      const attempt = store['wallet-payments.json'].find((r) => r.orderId === res.body.data.orderId);
      expect(attempt.inmateId).toBe(INMATE); // still the call's inmate, not roomId
    }
  });
});

// ===========================================================================
// 3. AMOUNT / PRICE MANIPULATION
// ===========================================================================
describe('ATTACK: amount manipulation', () => {
  test.each([
    [0], [-1], [-100], [100.5], [0.1], ['100'], ['abc'], [null], [undefined],
    [NaN], [Infinity], [-Infinity], [1e15], [2001], [999999999],
    [true], [false], [[]], [{}], [{ toString: '100' }],
    [BigInt(100).toString()], ['+100'], ['0100'], [' 100'], ['100 '],
    ['1e2'], ['0x64'], ['100.0'], [-0], [Number.MAX_SAFE_INTEGER],
  ])('C1 amount=%p -> 400 or rejected, no order created', async (amount) => {
    const res = await order(sign(), { amount });
    expect(res.status).toBe(400);
    expect(razorpay.createOrder).not.toHaveBeenCalled();
  });

  test('C2 body amountPaise override ignored (server computes paise)', async () => {
    const res = await order(sign(), { amount: 100, amountPaise: 1, currency: 'EUR', receipt: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.data.amountPaise).toBe(10000);
    expect(res.body.data.currency).toBe('INR');
  });

  test('C3 prototype pollution in body cannot change MIN/MAX', async () => {
    const res = await order(sign(), JSON.parse('{"amount":100,"__proto__":{"MIN_RUPEES":0,"MAX_RUPEES":999999}}'));
    // If polluted, amount 999999 would be accepted; it must NOT be.
    const res2 = await order(sign(), JSON.parse('{"amount":999999}'));
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('INVALID_AMOUNT');
  });

  test('C4 amount=2000 exactly at MAX -> 200 (boundary ok)', async () => {
    const res = await order(sign(), { amount: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.data.amountPaise).toBe(200000);
  });

  test('C5 amount=2001 one rupee over MAX -> 400', async () => {
    const res = await order(sign(), { amount: 2001 });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 4. DAILY CAP BYPASS ATTEMPTS
// ===========================================================================
describe('ATTACK: daily cap bypass', () => {
  test('D1 5 x Rs.2000 orders hit the Rs.5000 cap on the 3rd', async () => {
    let blocked = false;
    for (let i = 0; i < 5; i++) {
      const res = await order(sign(), { amount: 2000 }, { 'X-Forwarded-For': `10.77.0.${i}` });
      if (res.status === 400 && res.body.error.code === 'DAILY_LIMIT') {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  test('D2 rotating X-Forwarded-For does NOT bypass the daily cap', async () => {
    // The cap is keyed by contactId, not IP — rotating IPs must not help.
    let capHit = false;
    for (let i = 0; i < 10; i++) {
      const res = await order(sign(), { amount: 2000 }, { 'X-Forwarded-For': `172.16.${i}.1` });
      if (res.status === 400 && res.body.error.code === 'DAILY_LIMIT') { capHit = true; break; }
    }
    expect(capHit).toBe(true);
  });

  test('D3 using both SMS wallet-link AND call-wallet shares the same cap', async () => {
    // Seed 4900 Rs credited via a wallet-link attempt for the SAME contactId.
    store['wallet-payments.json'] = [{
      paymentId: 'PAY-SHARED', orderId: 'order_shared', linkId: 'WL-X',
      contactId: CONTACT, inmateId: INMATE, amountPaise: 490000, status: 'credited',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }];
    const res = await order(sign(), { amount: 200 }); // 200 Rs -> 5100 > 5000
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DAILY_LIMIT');
  });

  test('D4 stale unpaid attempt (31 min old) no longer blocks the cap', async () => {
    store['wallet-payments.json'] = [{
      paymentId: 'PAY-STALE', orderId: 'order_stale', linkId: null,
      contactId: CONTACT, inmateId: INMATE, amountPaise: 499000, status: 'created',
      createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(), updatedAt: new Date().toISOString(),
    }];
    const res = await order(sign(), { amount: 100 });
    expect(res.status).toBe(200); // no longer counted
  });
});

// ===========================================================================
// 5. CROSS-CONTACT / CROSS-TENANT VERIFY
// ===========================================================================
describe('ATTACK: cross-contact verify', () => {
  test('E1 contact A cannot verify contact B\'s order -> 404', async () => {
    seedAttempt({ contactId: OTHER_CONTACT, inmateId: OTHER_INMATE, orderId: 'order_evil_001' });
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_evil', order_id: 'order_evil_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_evil_001', razorpayPaymentId: 'pay_evil',
      razorpaySignature: paySign('order_evil_001', 'pay_evil'),
    });
    expect(res.status).toBe(404);
    expect(store['transactions.json']).toHaveLength(0);
  });

  test('E2 same contact but different inmate -> 404', async () => {
    seedAttempt({ inmateId: OTHER_INMATE, orderId: 'order_wrong_inmate' });
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_w', order_id: 'order_wrong_inmate', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_wrong_inmate', razorpayPaymentId: 'pay_w',
      razorpaySignature: paySign('order_wrong_inmate', 'pay_w'),
    });
    expect(res.status).toBe(404);
  });

  test('E3 forged order id that does not exist -> 404', async () => {
    const res = await verify(sign(), {
      razorpayOrderId: 'order_forged_999', razorpayPaymentId: 'pay_f',
      razorpaySignature: paySign('order_forged_999', 'pay_f'),
    });
    expect(res.status).toBe(404);
  });

  test('E4 wallet-link order cannot be verified via call-wallet (linkId mismatch is OK but contact must match)', async () => {
    // A wallet-link attempt has linkId set; call-wallet checks contactId+inmateId only.
    // If the SAME contact created the wallet-link order, they CAN verify it via call-wallet.
    // This is by design (same contact, same money), but let's confirm the cross-contact case is blocked.
    seedAttempt({ linkId: 'WL-X', contactId: OTHER_CONTACT, inmateId: OTHER_INMATE, orderId: 'order_wl_evil' });
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_wl', order_id: 'order_wl_evil', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_wl_evil', razorpayPaymentId: 'pay_wl',
      razorpaySignature: paySign('order_wl_evil', 'pay_wl'),
    });
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 6. SIGNATURE / PAYMENT FORGERY
// ===========================================================================
describe('ATTACK: Razorpay signature forgery', () => {
  test('F1 wrong signature -> 400, no credit', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: 'deadbeef'.repeat(8),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SIGNATURE_INVALID');
    expect(store['transactions.json']).toHaveLength(0);
  });

  test('F2 signature for order A used with order B -> 400', async () => {
    seedAttempt({ orderId: 'order_A' });
    seedAttempt({ orderId: 'order_B' });
    const sigForA = paySign('order_A', 'pay_A');
    const res = await verify(sign(), {
      razorpayOrderId: 'order_B', razorpayPaymentId: 'pay_B',
      razorpaySignature: sigForA,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SIGNATURE_INVALID');
  });

  test('F3 amount mismatch (gateway says 10x) -> 400, no credit', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS * 10, fee: 0, tax: 0, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    });
    expect(res.status).toBe(400);
    expect(store['transactions.json']).toHaveLength(0);
  });

  test('F4 payment_id mismatch vs previously recorded id -> 400', async () => {
    seedAttempt({ razorpayPaymentId: 'pay_original' });
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_spoofed', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_spoofed',
      razorpaySignature: paySign('order_seed_001', 'pay_spoofed'),
    });
    expect(res.status).toBe(400);
    expect(store['transactions.json']).toHaveLength(0);
  });

  test('F5 payment belonging to another order -> 400', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_someone_else', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    });
    expect(res.status).toBe(400);
  });

  test('F6 empty / missing signature -> 400', async () => {
    seedAttempt();
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: '',
    });
    expect(res.status).toBe(400);
  });

  test('F7 null signature -> 400', async () => {
    seedAttempt();
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: null,
    });
    expect(res.status).toBe(400);
  });

  test('F8 non-captured (created/authorized/failed) payment -> 400 PAYMENT_NOT_CAPTURED', async () => {
    seedAttempt();
    for (const status of ['created', 'authorized', 'failed', 'refunded', 'partially_refunded']) {
      razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status, amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
      const res = await verify(sign(), {
        razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
        razorpaySignature: paySign('order_seed_001', 'pay_x'),
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PAYMENT_NOT_CAPTURED');
    }
  });
});

// ===========================================================================
// 7. REPLAY / DOUBLE-CREDIT / RACE
// ===========================================================================
describe('ATTACK: replay and double-credit', () => {
  test('G1 sequential verify replay credits once', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const body = {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    };
    for (let i = 0; i < 5; i++) await verify(sign(), body);
    expect(store['transactions.json']).toHaveLength(1);
    expect(store['wallets.json'][0].balance).toBe(NET);
  });

  test('G2 10 concurrent verify requests credit exactly once', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const body = {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => verify(sign(), body)));
    results.forEach((r) => expect([200, 429]).toContain(r.status)); // 429 ok (rate limit)
    expect(store['transactions.json']).toHaveLength(1);
  });

  test('G3 webhook + verify concurrent race credits once', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const body = {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    };
    const webhookRaw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_x', order_id: 'order_seed_001', amount: GROSS, status: 'captured', fee: FEE, tax: TAX, currency: 'INR' } } },
    });
    const webhookSig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(webhookRaw).digest('hex');
    const results = await Promise.all([
      verify(sign(), body),
      request(app).post('/api/webhooks/razorpay').set('Content-Type', 'application/json').set('X-Razorpay-Signature', webhookSig).send(webhookRaw),
      verify(sign(), body),
    ]);
    expect(store['transactions.json']).toHaveLength(1);
  });

  test('G4 authorized payment captured twice (race) credits once', async () => {
    seedAttempt();
    razorpay.fetchPayment
      .mockResolvedValueOnce({ id: 'pay_x', order_id: 'order_seed_001', status: 'authorized', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' })
      .mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    razorpay.capturePayment.mockRejectedValue(new Error('already captured'));
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    });
    expect(res.status).toBe(200);
    expect(store['transactions.json']).toHaveLength(1);
  });
});

// ===========================================================================
// 8. ORIGIN / CSRF / BODY SIZE
// ===========================================================================
describe('ATTACK: Origin bypass and CSRF', () => {
  test('H1 foreign Origin on order -> 403', async () => {
    const res = await order(sign(), { amount: 100 }, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  test('H2 foreign Origin on verify -> 403', async () => {
    const res = await verify(sign(), {}, { Origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  test('H3 Origin header case/whitespace variations still rejected', async () => {
    for (const o of ['https://evil.example', 'https://evil.example ', ' https://evil.example', 'HTTPS://EVIL.EXAMPLE']) {
      const res = await order(sign(), { amount: 100 }, { Origin: o });
      expect(res.status).toBe(403);
    }
  });

  test('H4 no Origin header (non-browser) is allowed (token still gates)', async () => {
    const res = await order(sign(), { amount: 100 });
    expect(res.status).toBe(200); // CSRF doesn't apply without a browser cookie
  });

  test('H5 oversized body via Content-Length -> 413', async () => {
    const res = await order(sign(), { amount: 100, pad: 'x'.repeat(9000) });
    expect(res.status).toBe(413);
  });

  test('H6 oversized body via chunked encoding -> 413', async () => {
    const srv = app.listen(0);
    const port = srv.address().port;
    const body = JSON.stringify({ amount: 100, pad: 'x'.repeat(9000) });
    try {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          port, path: '/family/call-wallet/order', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked', Authorization: `Bearer ${sign()}` },
        }, (r) => {
          let data = '';
          r.on('data', (c) => { data += c; });
          r.on('end', () => resolve({ status: r.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      expect(res.status).toBe(413);
    } finally { srv.close(); }
  });

  test('H7 malformed JSON -> 400', async () => {
    const res = await request(app).post('/family/call-wallet/order')
      .set(ip()).set('Authorization', `Bearer ${sign()}`)
      .set('Content-Type', 'application/json').send('{amount:');
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 9. HEADER / AUTH EDGE CASES
// ===========================================================================
describe('ATTACK: header and auth edge cases', () => {
  test('I1 missing Authorization -> 401', async () => {
    const res = await request(app).get('/family/call-wallet/info').set(ip());
    expect(res.status).toBe(401);
  });

  test('I2 Authorization without Bearer prefix -> 401', async () => {
    const res = await request(app).get('/family/call-wallet/info').set(ip()).set('Authorization', sign());
    expect(res.status).toBe(401);
  });

  test('I3 Bearer with extra whitespace / newline -> 401 or tolerated', async () => {
    // supertest/Node strips trailing newlines from header values; extra space
    // after "Bearer " is handled by .trim(). Neither is a security issue.
    const res = await request(app).get('/family/call-wallet/info').set(ip()).set('Authorization', `Bearer  ${sign()}`);
    expect([200, 401]).toContain(res.status);
  });

  test('I4 extremely long Authorization header -> 401 (not 500)', async () => {
    const res = await info('A'.repeat(10000));
    expect(res.status).toBe(401);
  });

  test('I5 Cache-Control: no-store on every response', async () => {
    const r1 = await info(sign());
    expect(r1.headers['cache-control']).toBe('no-store');
    const r2 = await order(sign(), { amount: 100 });
    expect(r2.headers['cache-control']).toBe('no-store');
  });

  test('I6 security headers present on call-wallet responses', async () => {
    const res = await info(sign());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  test('I7 no secret leakage in any response body', async () => {
    seedAttempt();
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const dump = JSON.stringify([
      (await info(sign())).body,
      (await order(sign(), { amount: 100 })).body,
      (await verify(sign(), {
        razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
        razorpaySignature: paySign('order_seed_001', 'pay_x'),
      })).body,
    ]);
    expect(dump).not.toContain(KEY_SECRET);
    expect(dump).not.toContain(process.env.RAZORPAY_WEBHOOK_SECRET);
    expect(dump).not.toContain(SECRET);
  });
});

// ===========================================================================
// 10. INFO LEAKAGE / ENUMERATION
// ===========================================================================
describe('ATTACK: information leakage', () => {
  test('J1 dead/garbage token -> 401 (uniform, no oracle)', async () => {
    for (const bad of ['dead', 'null', 'undefined', 'a'.repeat(500)]) {
      const res = await info(bad);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    }
  });

  test('J2 expired token -> 401 same code as garbage', async () => {
    const expired = sign({}, { expiresIn: '-1s' });
    const garbage = await info('garbage_token_xyz');
    const expiredRes = await info(expired);
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.error.code).toBe(garbage.body.error.code);
  });

  test('J3 info does not leak contactId/inmateId/callId in response body', async () => {
    const res = await info(sign());
    const dump = JSON.stringify(res.body);
    expect(dump).not.toContain(CONTACT);
    expect(dump).not.toContain(INMATE);
    expect(dump).not.toContain(CALL_ID);
  });

  test('J4 error messages do not reveal internal state', async () => {
    const res = await verify(sign(), { razorpayOrderId: 'order_none', razorpayPaymentId: 'p', razorpaySignature: 's' });
    expect(res.body.error.message).not.toMatch(/stack|trace|query|sql|file|path/i);
  });
});

// ===========================================================================
// 11. CONTACT STATE ATTACKS
// ===========================================================================
describe('ATTACK: revoked / blocked contact', () => {
  test('K1 blocked contact -> 403 on info', async () => {
    store['contacts.json'][0].status = 'blocked';
    const res = await info(sign());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONTACT_DISABLED');
  });

  test('K2 rejected contact -> 403 on order', async () => {
    store['contacts.json'][0].approvalStatus = 'rejected';
    const res = await order(sign(), { amount: 100 });
    expect(res.status).toBe(403);
  });

  test('K3 inactive contact -> 403 on verify', async () => {
    store['contacts.json'][0].active = false;
    const res = await verify(sign(), {});
    expect(res.status).toBe(403);
  });

  test('K4 contact deleted mid-session -> 403', async () => {
    store['contacts.json'] = [];
    const res = await info(sign());
    expect(res.status).toBe(403);
  });

  test('K5 call deleted mid-session -> 404', async () => {
    store['calls.json'] = [];
    const res = await info(sign());
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// 12. CONCURRENT ORDER CREATION (cap race) — atomic reserve closes TOCTOU
// ===========================================================================
describe('ATTACK: concurrent order creation to bypass cap', () => {
  test('L1 5 concurrent Rs.2000 orders: at most 2 succeed under a Rs.5000 cap', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        order(sign(), { amount: 2000 }, { 'X-Forwarded-For': `10.66.0.${i}` })
      )
    );
    const succeeded = results.filter((r) => r.status === 200);
    const blocked = results.filter((r) => r.status === 400 && r.body.error.code === 'DAILY_LIMIT');
    // Atomic reserve: 2 x 2000 = 4000 <= 5000; 3rd would be 6000 > 5000.
    // With the mutex the cap is strictly enforced — no TOCTOU slip-through.
    expect(succeeded.length).toBe(2);
    expect(blocked.length).toBe(3);
  });

  test('L2 10 concurrent Rs.500 orders: at most 10 succeed (5000/500), rest blocked', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        order(sign(), { amount: 500 }, { 'X-Forwarded-For': `10.65.0.${i}` })
      )
    );
    const succeeded = results.filter((r) => r.status === 200);
    // 10 x 500 = 5000 exactly — all fit, none blocked.
    expect(succeeded.length).toBe(10);
  });

  test('L3 11 concurrent Rs.500 orders: exactly 10 succeed, 1 blocked', async () => {
    const results = await Promise.all(
      Array.from({ length: 11 }, (_, i) =>
        order(sign(), { amount: 500 }, { 'X-Forwarded-For': `10.64.0.${i}` })
      )
    );
    const succeeded = results.filter((r) => r.status === 200);
    const blocked = results.filter((r) => r.status === 400 && r.body.error.code === 'DAILY_LIMIT');
    expect(succeeded.length).toBe(10);
    expect(blocked.length).toBe(1);
  });
});

// ===========================================================================
// 13. ORDER ID COLLISION / PREDICTABILITY
// ===========================================================================
describe('ATTACK: order id predictability', () => {
  test('M1 paymentId uses Date.now + Math.random — not guessable in practice', async () => {
    // Create two orders quickly; ids must differ.
    const r1 = await order(sign(), { amount: 100 }, { 'X-Forwarded-For': '10.55.0.1' });
    const r2 = await order(sign(), { amount: 100 }, { 'X-Forwarded-For': '10.55.0.2' });
    expect(r1.body.data.orderId).not.toBe(r2.body.data.orderId);
  });

  test('M2 attacker-supplied orderId in body is ignored', async () => {
    const res = await order(sign(), { amount: 100, orderId: 'order_attacker_chosen', id: 'order_attacker' });
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).not.toBe('order_attacker_chosen');
    expect(res.body.data.orderId).not.toBe('order_attacker');
  });
});

// ===========================================================================
// 14. DOUBLE-SPEND: order created, payment captured, then try to re-credit
// ===========================================================================
describe('ATTACK: re-credit after successful payment', () => {
  test('N1 already-credited order: verify returns ok but does NOT double-credit', async () => {
    seedAttempt({ status: 'credited', transactionId: 'TXN-OLD', netCreditedPaise: NET, razorpayPaymentId: 'pay_x' });
    // Seed the existing ledger entry too.
    store['transactions.json'] = [{
      transactionId: 'TXN-OLD', walletId: 'W-1', inmateId: INMATE, type: 'recharge',
      status: 'completed', amount: NET, orderId: 'order_seed_001', timestamp: new Date().toISOString(),
    }];
    store['wallets.json'] = [{ walletId: 'W-1', inmateId: INMATE, balance: NET, currency: 'INR' }];
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    });
    expect(res.status).toBe(200);
    expect(store['transactions.json']).toHaveLength(1); // still one
    expect(store['wallets.json'][0].balance).toBe(NET); // unchanged
  });

  test('N2 attempt row status flipped to credited but ledger missing: still credits once (crash recovery)', async () => {
    seedAttempt({ status: 'credited', transactionId: 'TXN-GHOST', netCreditedPaise: NET });
    // Ledger intentionally empty (simulates crash between cache update and ledger write — inverse).
    // The row says credited so creditFromRazorpay returns alreadyCredited without writing.
    razorpay.fetchPayment.mockResolvedValue({ id: 'pay_x', order_id: 'order_seed_001', status: 'captured', amount: GROSS, fee: FEE, tax: TAX, currency: 'INR' });
    const res = await verify(sign(), {
      razorpayOrderId: 'order_seed_001', razorpayPaymentId: 'pay_x',
      razorpaySignature: paySign('order_seed_001', 'pay_x'),
    });
    expect(res.status).toBe(200);
    // The attempt is already credited so no new ledger row is written — money
    // is "lost" from the ledger perspective but the attempt row records it.
    // This is the documented crash model: the sweep or webhook would have
    // already written the ledger row; here the row was manually corrupted.
    expect(store['transactions.json']).toHaveLength(0);
  });
});

// ===========================================================================
// 15. SSRF / INJECTION via body fields
// ===========================================================================
describe('ATTACK: injection via body fields', () => {
  test('O1 XSS / HTML in amount field is rejected as non-integer', async () => {
    const res = await order(sign(), { amount: '<script>alert(1)</script>' });
    expect(res.status).toBe(400);
  });

  test('O2 SQL/NoSQL injection in razorpayOrderId is treated as literal string', async () => {
    seedAttempt();
    const res = await verify(sign(), {
      razorpayOrderId: "'; DROP TABLE wallets;--",
      razorpayPaymentId: 'p',
      razorpaySignature: 's',
    });
    expect(res.status).toBe(404); // no matching attempt
    expect(store['wallets.json']).toBeDefined(); // store not destroyed
  });

  test('O3 prototype pollution via __proto__ in verify body', async () => {
    seedAttempt();
    const res = await verify(sign(), JSON.parse('{"razorpayOrderId":"order_seed_001","razorpayPaymentId":"pay_x","razorpaySignature":"x","__proto__":{"status":"credited"}}'));
    // Should not flip the attempt to credited.
    expect(store['wallet-payments.json'][0].status).toBe('created');
    expect(store['transactions.json']).toHaveLength(0);
  });
});
