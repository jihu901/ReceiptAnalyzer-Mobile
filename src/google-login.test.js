import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../public/google-login.js', import.meta.url), 'utf8');
test('callback removes URL secrets and sends only required fields without Google cookies', async () => {
  const calls = [], history = [], status = {};
  await runInNewContext(source, {
    URLSearchParams, location: {search: '?state='+'s'.repeat(43)+'&code=fake&authuser=2', pathname:'/google-login.html'},
    history: {replaceState: (...args)=>history.push(args)},
    document:{getElementById:()=>status}, fetch:async (...args)=>calls.push(args)
  });
  expect(history[0][2]).toBe('/google-login.html');
  expect(calls).toHaveLength(1);
  const options=calls[0][1];
  expect(options.credentials).toBe('omit');
  expect(options.referrerPolicy).toBe('no-referrer');
  expect(options.body.has('authuser')).toBe(false);
  expect(options.body.get('code')).toBe('fake');
  expect(status.textContent).toContain('PC 앱으로');
});
test('invalid callback never contacts the server', async()=>{
  let called=false; const status={};
  await runInNewContext(source, {URLSearchParams,location:{search:'?code=fake',pathname:'/google-login.html'},
    history:{replaceState(){}},document:{getElementById:()=>status},fetch:()=>called=true});
  expect(called).toBe(false);
  expect(status.textContent).toContain('다시');
});
