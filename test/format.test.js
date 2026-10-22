const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(cfg) {
  const win = { __ccTsConfig: cfg, addEventListener() {} };
  const ctx = vm.createContext({
    window: win, Intl, Date, JSON, Object, String, parseInt,
    document: { body: null, addEventListener() {} }, MutationObserver: function () {}, setTimeout() {}, setInterval() {}, clearInterval() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'inject.js'), 'utf8'), ctx);
  return win.__ccTsFmt;
}
const ISO = '2026-03-05T21:07:09.000Z';

test('UTC default format', () => assert.strictEqual(load({ timeZone: 'UTC' })(ISO), '2026-03-05 21:07:09'));
test('fixed offset crosses midnight', () => assert.strictEqual(load({ timeZone: 'UTC+9' })(ISO), '2026-03-06 06:07:09'));
test('negative offset with minutes', () => assert.strictEqual(load({ timeZone: 'UTC-03:30' })(ISO), '2026-03-05 17:37:09'));
test('IANA zone', () => assert.strictEqual(load({ timeZone: 'Asia/Tokyo' })(ISO), '2026-03-06 06:07:09'));
test('custom format, 12h', () => assert.strictEqual(load({ timeZone: 'UTC', format: 'hh:mm a dd.MM.yyyy' })(ISO), '09:07 PM 05.03.2026'));
test('invalid iso -> null', () => assert.strictEqual(load({ timeZone: 'UTC' })('nope'), null));
