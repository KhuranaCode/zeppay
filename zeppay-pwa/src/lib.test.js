import { describe, it, expect } from 'vitest';
import { parseUpi, isValidVpa, validateAmount, formatINR, telHref, carrierSupported, isValidMobile, normMobile, newId, USSD_MOBILE, upiLink, groupByDay, initials, USSD_SEND } from './lib.js';

describe('vpa', () => {
  it('accepts valid', () => { expect(isValidVpa('ravi.k@okaxis')).toBe(true); expect(isValidVpa('9876543210@ybl')).toBe(true); });
  it('rejects invalid', () => { for (const v of ['', 'abc', 'a@b', '@ybl', 'x y@ybl', null]) expect(isValidVpa(v)).toBe(false); });
});
describe('parseUpi', () => {
  it('parses full link', () => {
    expect(parseUpi('upi://pay?pa=shop@okicici&pn=Chai%20Point&am=120.50&tn=tea&cu=INR')).toEqual({ vpa: 'shop@okicici', name: 'Chai Point', amount: '120.5', note: 'tea' });
  });
  it('parses bare vpa', () => { expect(parseUpi(' me@ybl ').vpa).toBe('me@ybl'); });
  it('rejects junk and bad pa', () => {
    expect(parseUpi('https://example.com')).toBeNull();
    expect(parseUpi('upi://pay?pn=x')).toBeNull();
    expect(parseUpi('upi://pay?pa=bad')).toBeNull();
    expect(parseUpi('')).toBeNull();
    expect(parseUpi(undefined)).toBeNull();
  });
  it('drops zero/negative amount', () => { expect(parseUpi('upi://pay?pa=a1@ybl&am=0').amount).toBe(''); });
});
describe('amount', () => {
  it('bounds', () => {
    expect(validateAmount('')).toMatch(/Enter/);
    expect(validateAmount('0')).toMatch(/Minimum/);
    expect(validateAmount('5001')).toMatch(/5,000/);
    expect(validateAmount('10.999')).toMatch(/decimals/);
    expect(validateAmount('1')).toBe('');
    expect(validateAmount('5000')).toBe('');
    expect(validateAmount('99.5')).toBe('');
  });
});
describe('misc', () => {
  it('formatINR', () => { expect(formatINR(1234567)).toBe('₹12,34,567'); expect(formatINR(10.5)).toBe('₹10.50'); });
  it('telHref encodes #', () => { expect(telHref(USSD_SEND)).toBe('tel:*99*1*3%23'); });
  it('carrier', () => { expect(carrierSupported('jio')).toBe(false); expect(carrierSupported('airtel')).toBe(true); });
  it('ids differ', () => { expect(newId(1, () => 0.1)).not.toBe(newId(1, () => 0.2)); });
  it('mobile', () => { expect(isValidMobile('98765 43210')).toBe(true); expect(isValidMobile('+919876543210')).toBe(true); expect(isValidMobile('12345')).toBe(false); expect(isValidMobile('5876543210')).toBe(false); expect(normMobile('+91 98765-43210')).toBe('9876543210'); expect(USSD_MOBILE).toBe('*99*1*1#'); });
  it('upiLink roundtrip', () => { const o = { vpa: 'a1@ybl', name: 'A B', amount: '10', note: 'hi' }; expect(parseUpi(upiLink(o))).toEqual(o); });
  it('initials', () => { expect(initials('Ravi Kumar')).toBe('RK'); expect(initials('')).toBe('?'); });
  it('groupByDay', () => {
    const now = Date.now();
    const g = groupByDay([{ at: now }, { at: now - 1000 }, { at: now - 864e5 }], now);
    expect(g.map((x) => x.label)).toEqual(['Today', 'Yesterday']); expect(g[0].items.length).toBe(2);
  });
});

describe('platform dial codes', () => {
  const ios = (v) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v}_0 like Mac OS X)`;
  const android = 'Mozilla/5.0 (Linux; Android 16)';
  it('Android dials the full command with the payee embedded', async () => {
    const { ussdPayCode, ussdBalanceCode, ussdHandoffKind, ussdMenuCode } = await import('./lib.js');
    expect(ussdPayCode({ vpa: 'a.b@ybl' }, android)).toBe('*99*1*3*a.b@ybl#');
    expect(ussdPayCode({ mobile: '9876543210' }, android)).toBe('*99*1*1*9876543210#');
    expect(ussdBalanceCode(android)).toBe('*99*3#');
    expect(ussdMenuCode(android)).toBe('*99#');
    expect(ussdHandoffKind(android)).toBe('fast');
  });
  it('auto defaults iPhone to the iOS 27 double-hash style (UA version is unreliable)', async () => {
    const { ussdPayCode, ussdBalanceCode, ussdHandoffKind, ussdMenuCode } = await import('./lib.js');
    for (const v of [16, 17, 18, 26, 27, 28]) {
      expect(ussdHandoffKind(ios(v))).toBe('sub');
      expect(ussdMenuCode(ios(v))).toBe('*99##');
      expect(ussdPayCode({ vpa: 'a.b@ybl' }, ios(v))).toBe('*99*1*3##');
      expect(ussdPayCode({ mobile: '9876543210' }, ios(v))).toBe('*99*1*1##');
      expect(ussdBalanceCode(ios(v))).toBe('*99*3##');
    }
  });
  it('manual override pins the style', async () => {
    const { ussdPayCode, ussdBalanceCode, ussdHandoffKind, ussdMenuCode } = await import('./lib.js');
    expect(ussdHandoffKind(ios(27), 'ios26')).toBe('menu');
    expect(ussdPayCode({ vpa: 'a.b@ybl' }, ios(27), 'ios26')).toBe('*99#');
    expect(ussdBalanceCode(ios(18), 'ios26')).toBe('*99#');
    expect(ussdMenuCode(ios(18), 'ios26')).toBe('*99#');
    expect(ussdHandoffKind(ios(18), 'ios27')).toBe('sub');
    expect(ussdPayCode({ vpa: 'a.b@ybl' }, ios(18), 'ios27')).toBe('*99*1*3##');
    expect(ussdBalanceCode(ios(18), 'ios27')).toBe('*99*3##');
    expect(ussdHandoffKind(android, 'ios26')).toBe('fast');
  });
  it('non-iPhone and unknown platforms use single hash', async () => {
    const { ussdMenuCode } = await import('./lib.js');
    expect(ussdMenuCode(android)).toBe('*99#');
    expect(ussdMenuCode('unknown')).toBe('*99#');
  });
});

// Synthetic standard UPI payloads, not captured FamApp QR samples.
describe('Fam UPI addresses', () => {
  it('accepts static and dynamic @fam payment payloads without an online lookup', () => {
    expect(parseUpi('upi://pay?pa=sample.user@fam&pn=Scanner%20Test&cu=INR')).toEqual({vpa:'sample.user@fam',name:'Scanner Test',amount:'',note:''});
    expect(parseUpi('upi://pay?pa=sample.user@fam&pn=Scanner%20Test&am=35&tr=ORDER12345&tn=ORDER12345&cu=INR')).toEqual({vpa:'sample.user@fam',name:'Scanner Test',amount:'35',note:'ORDER12345'});
  });
});
