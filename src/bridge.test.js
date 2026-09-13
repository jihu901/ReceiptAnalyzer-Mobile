import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe, it, expect} from 'vitest';

const mobile = readFileSync(new URL('./main.js', import.meta.url), 'utf8');

describe('Google response origins', () => {
  const pattern = mobile.match(/if \(!(.+?)\.test\(event.origin\)/)[1];
  const allowed = vm.runInNewContext(pattern);
  it('accepts the actual Google Apps Script sandbox hostname', () => {
    expect(allowed.test('https://n-de2ku4a5pmooz54p44wp5mnzirckvfsbqaes27a-0lu-script.googleusercontent.com')).toBe(true);
    expect(allowed.test('https://script.googleusercontent.com')).toBe(true);
  });
  it('rejects non-Google messages and lookalike hosts', () => {
    expect(allowed.test('https://untrusted.example')).toBe(false);
    expect(allowed.test('https://script.googleusercontent.com.untrusted.example')).toBe(false);
    expect(allowed.test('http://script.googleusercontent.com')).toBe(false);
  });
});

describe('new QR replaces stale phone credentials', () => {
  it('exchanges a new pairing even when the phone has an old key', () => {
    const saved = new Map([['ra.endpoint', 'https://example.test/exec'], ['ra.key', 'old-key']]);
    const context = vm.createContext({
      URLSearchParams,
      location: {hash: '#endpoint=https%3A%2F%2Fexample.test%2Fexec&pairing=new-pair', pathname: '/', search: ''},
      history: {replaceState() {}},
      localStorage: {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key)}
    });
    vm.runInContext(mobile.slice(mobile.indexOf('function readPairing()'), mobile.indexOf('let pairing = readPairing()')), context);
    expect(context.readPairing()).toMatchObject({key: '', oneTimePairing: 'new-pair'});
  });
});
