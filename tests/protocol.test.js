'use strict';
// Byte-level tests. The expected packets are taken from the HCI snoop log of the
// official Govee app talking to an H6001 bulb (see DEVELOPMENT.md).
process.env.TZ = 'Europe/Berlin';       // the clock packets contain local time (UTC+2 in summer)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./helpers');

const P = loadPure('index.html');
const bytes = s => s.trim().split(/\s+/).map(h => parseInt(h, 16));

test('frame pads to 20 bytes and appends the XOR checksum', () => {
  assert.equal(P.hex(P.frame([0xaa, 0x0a, 0x00])), 'aa 0a 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0');
  assert.equal(P.hex(P.frame([0x33, 0x01, 0x01])), '33 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 33');
  assert.equal(P.hex(P.frame([0x33, 0x05, 0x04, 0x01])), '33 05 04 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 33');
});

test('checksum matches real replies captured from the bulb', () => {
  const replies = [
    'aa 06 32 2e 30 31 2e 30 35 00 31 2e 30 25 64 2e 30 25 00 cf',
    'aa 07 03 31 2e 30 30 2e 30 35 00 00 00 00 00 00 00 00 00 9a',
    'aa 0a 00 09 11 08 0f 00 00 00 00 00 00 00 00 00 00 00 00 bf',
    'aa 0a 01 15 00 15 26 01 00 00 00 00 00 00 00 00 00 00 00 86',
    'aa 04 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ca',
  ];
  for (const r of replies) {
    const b = bytes(r);
    assert.equal(P.hex(P.frame(b.slice(0, 19))), r, r);
  }
});

test('clock packets equal the ones sent by the official app (UTC+2)', () => {
  const cases = [
    ['2026-10-15T04:54:59Z', '33 09 06 36 3b 04 01 02 00 0f 0a ea 07 a3 5c d0 6a 00 00 9b'],
    ['2026-10-15T04:55:18Z', '33 09 06 37 12 04 01 02 00 0f 0a ea 07 b6 5c d0 6a 00 00 a6'],
    ['2026-10-15T04:55:44Z', '33 09 06 37 2c 04 01 02 00 0f 0a ea 07 d0 5c d0 6a 00 00 fe'],
  ];
  for (const [iso, expected] of cases) assert.equal(P.hex(P.timeFrame(new Date(iso))), expected, iso);
});

test('timer write packets equal the ones sent by the official app', () => {
  assert.equal(P.hex(P.timerFrame(0, 9, 0x11, 8, 0x0f, false)), '33 0a 00 09 11 08 0f 00 00 00 00 00 00 00 00 00 00 00 00 26');
  assert.equal(P.hex(P.timerFrame(1, 0x15, 0, 0x15, 0x26, true)), '33 0a 01 15 00 15 26 01 00 00 00 00 00 00 00 00 00 00 00 1f');
  assert.equal(P.hex(P.timerFrame(0, 0x15, 0, 0x15, 0x26, true)), '33 0a 00 15 00 15 26 01 00 00 00 00 00 00 00 00 00 00 00 1e');
});

test('timer replies decode to the values shown in the official app', () => {
  const a = P.decodeTimer(Uint8Array.from(bytes('aa 0a 00 09 11 08 0f 00')));
  assert.deepEqual([a.idx, a.sh, a.sm, a.eh, a.em, a.en], [0, 9, 17, 8, 15, false]);
  assert.equal(a.text, '09:17 to 08:15, off');
  const b = P.decodeTimer(Uint8Array.from(bytes('aa 0a 01 15 00 15 26 01')));
  assert.deepEqual([b.idx, b.sh, b.sm, b.eh, b.em, b.en], [1, 21, 0, 21, 38, true]);
  assert.equal(b.text, '21:00 to 21:38, enabled');
});

test('sameTimer compares all fields', () => {
  const rec = P.decodeTimer(Uint8Array.from(bytes('aa 0a 01 08 00 08 33 01')));
  assert.ok(P.sameTimer(rec, 8, 0, 8, 51, true));
  assert.ok(!P.sameTimer(rec, 8, 0, 8, 50, true));
  assert.ok(!P.sameTimer(rec, 8, 0, 8, 51, false));
  assert.ok(!P.sameTimer(undefined, 8, 0, 8, 51, true));
});

test('hsvToRgb', () => {
  assert.deepEqual(P.hsvToRgb(0, 100, 100), [255, 0, 0]);
  assert.deepEqual(P.hsvToRgb(120, 100, 100), [0, 255, 0]);
  assert.deepEqual(P.hsvToRgb(240, 100, 100), [0, 0, 255]);
  assert.deepEqual(P.hsvToRgb(77, 0, 100), [255, 255, 255]);
});

test('browserKind', () => {
  assert.equal(P.browserKind(true, '', [{ brand: 'Chromium' }, { brand: 'Google Chrome' }]), 'chrome');
  assert.equal(P.browserKind(true, '', [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }]), 'other');
  assert.equal(P.browserKind(true, 'Mozilla/5.0 (Linux; Android 16) AppleWebKit Chrome/140.0 Mobile Safari', null), 'chrome');
  assert.equal(P.browserKind(true, 'Mozilla/5.0 Chrome/140 SamsungBrowser/28', null), 'other');
  assert.equal(P.browserKind(false, 'Chrome/140', null), 'none');
});

test('the lab tool uses the same frame and clock code as the page', () => {
  const L = loadPure('tools/lab.html');
  assert.equal(L.hex(L.frame([0xaa, 0x0a, 0x00])), P.hex(P.frame([0xaa, 0x0a, 0x00])));
  const d = new Date('2026-10-15T04:54:59Z');
  assert.equal(L.hex(L.timeFrame(d)), P.hex(P.timeFrame(d)));
  assert.deepEqual(L.parseHex('0xaa, 0x0a 00'), [0xaa, 0x0a, 0x00]);
});

test('the scripts of all HTML files parse without syntax errors', () => {
  const vm = require('node:vm');
  const { scriptOf } = require('./helpers');
  for (const f of ['index.html', 'tools/lab.html']) assert.doesNotThrow(() => new vm.Script(scriptOf(f)), f);
});
