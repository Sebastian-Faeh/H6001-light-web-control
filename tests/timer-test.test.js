'use strict';
// Behaviour tests for tools/timer-test.html against a fake browser and a fake bulb.
// The fake bulb here replaces record position 0 on a write to id 1 and discards writes to id 0.
// That is only a test model, NOT a claim about the real bulb (see PROTOCOL.md, open questions).
process.env.TZ = 'Europe/Berlin';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { scriptOf, loadPure } = require('./helpers');

const code = scriptOf('tools/timer-test.html');
const IDS = ['connect', 'search', 'disconnect', 'read', 'readstate', 'tbl', 'p1', 'p2', 'p3', 'plen', 'run1', 'in', 'len', 'en', 'wid', 'run2', 'expect', 'raw', 'sendraw', 'copylog', 'clearlog', 'log', 'status', 'gtitle', 'gtext', 'gb0', 'gb1', 'gb2', 'result', 'copyres', 'issue', 'resnote', 'restext'];
const until = async f => { for (let i = 0; i < 200 && !f(); i++) await wait(100); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function makePage() {
  const els = {};
  const mk = id => els[id] || (els[id] = { id, value: '', disabled: false, hidden: false, textContent: '', innerHTML: '', scrollTop: 0, onclick: null, focus() {}, select() {}, setSelectionRange() {} });
  IDS.forEach(mk);
  Object.assign(els, {});
  els.p1.value = '22:00'; els.p2.value = '23:00'; els.p3.value = '22:30'; els.plen.value = '15';
  els.in.value = '4'; els.len.value = '10'; els.en.value = '0'; els.wid.value = '1'; els.raw.value = 'aa 0a 00';
  els.expect.hidden = true;

  const slots = [{ id: 1, sh: 6, sm: 30, eh: 7, em: 15, en: 0 }, { id: 1, sh: 8, sm: 30, eh: 9, em: 15, en: 1 }];
  const sent = []; let notify = null; let disconnects = 0; const discListeners = [];
  const reply = a => setTimeout(() => notify({ target: { value: { buffer: Uint8Array.from(a).buffer } } }), 2);
  const writeChar = {
    async writeValueWithoutResponse(f) {
      sent.push(Array.from(f));
      if (f[0] === 0x33 && f[1] === 0x0a) { if (f[2] === 1) slots[0] = { id: 1, sh: f[3], sm: f[4], eh: f[5], em: f[6], en: f[7] }; reply([0x33, 0x0a, ...new Array(17).fill(0), 0]); }
      if (f[0] === 0xaa && f[1] === 0x0a) { const r = slots[f[2]]; reply([0xaa, 0x0a, r.id, r.sh, r.sm, r.eh, r.em, r.en, ...new Array(12).fill(0)]); }
    },
  };
  const server = { async getPrimaryService() { return { async getCharacteristic(u) { return u.endsWith('2b11') ? writeChar : { addEventListener(_, cb) { notify = cb; }, async startNotifications() {} }; } }; } };
  const dev = { name: 'Minger_H6001_TEST', id: 'abc', addEventListener(t, f) { if (t === 'gattserverdisconnected') discListeners.push(f); }, removeEventListener() {},
    gatt: { async connect() { return server; }, disconnect() { disconnects++; discListeners.forEach(f => f()); } } };
  let onLoad = null;
  const ctx = {
    document: { getElementById: mk, execCommand() { return true; } },
    navigator: { bluetooth: { async getDevices() { return [dev]; }, async requestDevice() { return dev; } }, clipboard: { async writeText() {} } },
    addEventListener(t, f) { if (t === 'load') onLoad = f; },
    setInterval() { return 0; }, setTimeout, clearTimeout, console, Date, Promise, Uint8Array, Math, Number, Array, parseInt, Set,
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { els, sent, slots, get disconnects() { return disconnects; }, start: async () => { await onLoad(); await wait(20); await els.connect.onclick(); await wait(50); }, load: async () => { await onLoad(); await wait(20); } };
}

test('connects on load through getDevices() and reads both timer positions', async () => {
  const p = makePage(); await p.start();
  assert.match(p.els.status.textContent, /^Connected to Minger_H6001_TEST/);
  await p.els.read.onclick();
  assert.match(p.els.log.value, /pos 0: id 1, 06:30 to 07:15, off \| pos 1: id 1, 08:30 to 09:15, enabled/);
  assert.match(p.els.tbl.innerHTML, /<td>0<\/td><td>1<\/td><td>06:30<\/td><td>07:15<\/td><td>no<\/td>/);
});

test('test 1 writes three probes with the right frames and reports which position changed', async () => {
  const p = makePage(); await p.start();
  p.sent.length = 0;
  await p.els.run1.onclick();
  const hexes = p.sent.filter(f => f[0] === 0x33).map(f => f.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  assert.deepEqual(hexes, ['33 0a 01 16 00 16 0f 01', '33 0a 01 17 00 17 0f 01', '33 0a 00 16 1e 16 2d 01']);
  const log = p.els.log.value;
  assert.match(log, /Probe 1 result: changed position\(s\) = 0; probe visible at position 0/);
  assert.match(log, /Probe 3 result: changed position\(s\) = none; probe visible at position nowhere/);
  assert.match(log, /=== Test 1 done/);
  assert.equal(p.els.run1.disabled, false, 'buttons are usable again');
});

test('test 2 writes a record that starts in a few minutes, reads it back and disconnects', async () => {
  const p = makePage(); await p.start();
  p.sent.length = 0;
  await p.els.run2.onclick();
  const w = p.sent.find(f => f[0] === 0x33 && f[1] === 0x0a);
  assert.equal(w[2], 1); assert.equal(w[7], 0, 'enabled = 0');
  const startMin = w[3] * 60 + w[4], endMin = w[5] * 60 + w[6];
  assert.equal((endMin - startMin + 1440) % 1440, 10);
  assert.equal(p.sent.some(f => f[0] === 0x33 && f[1] === 0x09), true, 'clock set first');
  assert.equal(p.disconnects, 1);
  assert.equal(p.els.expect.hidden, false);
  assert.match(p.els.expect.textContent, /enabled=0/);
  assert.match(p.els.log.value, /Written record visible at position 0, enabled=0/);
});

test('shared protocol code equals the main page', () => {
  const T = loadPure('tools/timer-test.html'), M = loadPure('index.html');
  const d = new Date('2026-10-15T04:54:59Z');
  assert.equal(T.hex(T.timeFrame(d)), M.hex(M.timeFrame(d)));
  assert.equal(T.hex(T.timerFrame(1, 8, 30, 9, 15, true)), M.hex(M.timerFrame(1, 8, 30, 9, 15, true)));
  assert.deepEqual(T.decodeTimer([0xaa, 0x0a, 1, 8, 30, 9, 15, 1]), M.decodeTimer([0xaa, 0x0a, 1, 8, 30, 9, 15, 1]));
});

test('windowFrom adds minutes and wraps past midnight', () => {
  const T = loadPure('tools/timer-test.html');
  assert.deepEqual(T.windowFrom('22:00', 15), [22, 0, 22, 15]);
  assert.deepEqual(T.windowFrom('23:50', 20), [23, 50, 0, 10]);
});

test('guided test asks step by step and reports which position each probe changed', async () => {
  const p = makePage(); await p.load();
  assert.equal(p.els.gtitle.textContent, 'Before you start');
  p.els.gb0.onclick(); await until(() => p.els.gtitle.textContent === 'Step 1 done');
  assert.match(p.els.gtext.textContent, /position 0: id 1, 06:30 to 07:15, off/);
  p.els.gb0.onclick(); await until(() => p.els.gtitle.textContent === 'Step 2 done');
  assert.match(p.els.gtext.textContent, /probe 1 \(write id 1, 22:00\): changed position\(s\) 0; visible at position 0/);
  assert.match(p.els.gtext.textContent, /probe 3 \(write id 0, 22:30\)/);
  assert.deepEqual(p.sent.filter(f => f[1] === 0x0a && f[0] === 0x33).map(f => f.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' ')).slice(0, 3),
    ['33 0a 01 16 00 16 0f 01', '33 0a 01 17 00 17 0f 01', '33 0a 00 16 1e 16 2d 01']);
});
