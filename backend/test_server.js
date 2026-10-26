/**
 * Black-box HTTP tests for the Zep Pay OTP proxy (dev mode, no Twilio/Supabase).
 * Spawns server.js on a scratch port and exercises /verify/start + /verify/check.
 * Run: node backend/test_server.js
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;

async function post(route, body) {
  const res = await fetch(BASE + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start in 10s')), 10000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('OTP proxy on')) { clearTimeout(t); resolve(); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
  });
}

// Unit checks for phone normalization (the same number in different user
// formats must produce ONE canonical E.164 key for OTP storage/matching).
const { e164 } = require('./server.js');

let failures = 0;
function checkEq(name, got, want) {
  if (got === want) { console.log(`PASS: ${name}`); }
  else { failures++; console.error(`FAIL: ${name} - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}

checkEq('bare 10-digit', e164('9876543210'), '+919876543210');
checkEq('messy +91 with spaces/dashes', e164('+91 98765-43210'), '+919876543210');
checkEq('trunk-prefix 0', e164('09876543210'), '+919876543210');
checkEq('+91 with trunk-prefix 0', e164('+91 098765 43210'), '+919876543210');
checkEq('clean 91-prefixed 12-digit', e164('919876543210'), '+919876543210');
checkEq('international with formatting', e164('+1 (415) 555-1234'), '+14155551234');
checkEq('too short rejected', e164('12345'), '');
checkEq('empty rejected', e164(''), '');
checkEq('too long rejected', e164('12345678901234567890'), '');

function check(name, cond) {
  if (cond) { console.log(`PASS: ${name}`); }
  else { failures++; console.error(`FAIL: ${name}`); }
}

async function main() {
  const child = spawn('node', [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await waitForServer(child);

    // Health endpoint reports dev mode without credentials.
    const health = await (await fetch(BASE + '/health')).json();
    check('health endpoint ok in dev mode', health.ok === true && health.mode === 'dev');

    // Same number entered in different formats must resolve to ONE OTP record:
    // start with a messy +91 format, check with the bare 10-digit format.
    const start = await post('/verify/start', { phone: '+91 98765-43210' });
    check('verify/start accepts messy +91 format', start.status === 200 && start.body.ok === true);

    const verify = await post('/verify/check', { phone: '9876543210', code: start.body.hint });
    check(
      'verify/check matches OTP across phone formats (+91 98765-43210 == 9876543210)',
      verify.body.approved === true,
    );

    // Trunk-prefix "0" dialing format must normalize to the same number.
    const startTz = await post('/verify/start', { phone: '+91 098765 43210' });
    const verifyTz = await post('/verify/check', { phone: '09876543210', code: startTz.body.hint });
    check(
      'trunk-prefix 0 format matches (+91 098765 43210 == 09876543210)',
      verifyTz.body.approved === true,
    );

    // Too-short numbers must be rejected, not turned into OTP keys.
    const shortNum = await post('/verify/start', { phone: '12345' });
    check('too-short phone rejected with 400', shortNum.status === 400);

    // Wrong code must be rejected.
    const start2 = await post('/verify/start', { phone: '9812345678' });
    const wrong = await post('/verify/check', { phone: '9812345678', code: '000000' });
    check('wrong code is rejected', wrong.body.approved === false);

    // Missing phone is a 400, not a 200 with an empty key.
    const noPhone = await post('/verify/start', { phone: '' });
    check('empty phone rejected with 400', noPhone.status === 400);
  } finally {
    child.kill();
  }
  if (failures) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
  console.log('\nAll backend checks passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
