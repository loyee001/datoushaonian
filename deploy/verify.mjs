#!/usr/bin/env node
// Run on the server as root. No secret or student data is printed.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const origin = 'https://datou.qdfb.tech';
const env = Object.fromEntries(fs.readFileSync('/etc/datou-classroom/app.env', 'utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => {
  const offset = line.indexOf('=');
  return [line.slice(0, offset), line.slice(offset + 1)];
}));
const request = (path, options = {}) => fetch(origin + path, {...options, signal: AbortSignal.timeout(10000)});
assert.equal((await request('/api/health')).status, 200);
assert.equal((await request('/api/bootstrap')).status, 401);
const login = await request('/api/auth/login', {
  method: 'POST', headers: {'content-type': 'application/json', origin},
  body: JSON.stringify({username: 'teacher', password: env.TEACHER_PASSWORD}),
});
assert.equal(login.status, 200, 'Teacher login failed.');
const setCookie = login.headers.get('set-cookie') || '';
assert.ok(/; Secure(?:;|$)/i.test(setCookie), 'Session cookie must be Secure.');
assert.ok(/; HttpOnly(?:;|$)/i.test(setCookie), 'Session cookie must be HttpOnly.');
const cookie = setCookie.split(';')[0];
const bootstrap = await request('/api/bootstrap', {headers: {cookie}});
assert.equal(bootstrap.status, 200);
const state = await bootstrap.json();
const counts = Object.fromEntries(['students', 'groups', 'sessions', 'attendance', 'reviews'].map(key => [key, state[key].length]));
if (process.argv.includes('--expect-empty')) assert.ok(Object.values(counts).every(count => count === 0), 'Expected a blank classroom.');
const logout = await request('/api/auth/logout', {method: 'POST', headers: {cookie, origin}});
assert.equal(logout.status, 200);
assert.equal((await request('/api/bootstrap', {headers: {cookie}})).status, 401);
console.log(JSON.stringify({ok: true, origin, counts, secureLoginAndLogout: true}));
