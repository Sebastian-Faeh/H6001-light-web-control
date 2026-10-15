'use strict';
// Behaviour tests for index.html against a small fake browser and a fake bulb
// (no real Bluetooth, no dependencies). The fake bulb mimics what was observed
// on the real one: writes to timer id 1 are stored, replies to "aa 0a n" are sorted
// by start time, and every set command is acknowledged with an all-zero payload.
process.env.TZ = 'Europe/Berlin';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { scriptOf } = require('./helpers');

const code = scriptOf('index.html');
const IDS = ['connect', 'search', 'tstart', 'tend', 'tactive', 'scene', 'save', 'readback', 'on', 'off', 'bright', 'hue', 'sat',
  'status', 'stored', 'result', 'warn', 'devname', 'devid', 'copyid', 'copylog', 'clearlog', 'log'];
const wait = ms => new Promise(r => setTimeout(r, ms));

function makePage(opt = {}) {
  const els = {};
  const mk = id => els[id] || (els[id] = {
    id, value: '', checked: true, disabled: false, hidden: false, textContent: '', className: '', style: {}, scrollTop: 0,
    classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, f) { f ? this.s.add(c) : this.s.delete(c); } },
    addEventListener() {}, focus() {}, select() {}, setSelectionRange() {},
  });
  IDS.forEach(mk);
  Object.assign(els.hue, { value: '0' }); Object.assign(els.sat, { value: '0' });
  els.scene.value = '0'; els.tstart.value = '08:00'; els.tend.value = '08:51';
  els.warn.hidden = true; els.result.hidden = true;     // both start hidden in index.html

  const timers = { 0: [9, 0x11, 8, 0x0f, 0], 1: [0x15, 0, 0x15, 0x26, 1] };
  const sent = []; let notify = null; let acceptTimerWrites = opt.rejectTimerWrites ? false : true;
  const reply = a => setTimeout(() => notify({ target: { value: { buffer: Uint8Array.from(a).buffer } } }), 2);
  const zeros = n => new Array(n).fill(0);
  const writeChar = {
    async writeValueWithoutResponse(f) {
      sent.push(Array.from(f));
      if (f[0] === 0x33 && f[1] === 0x0a) { if (f[2] === 1 && acceptTimerWrites) timers[1] = Array.from(f.slice(3, 8)); reply([0x33, 0x0a, ...zeros(17), 0x39]); }
      if (f[0] === 0xaa && f[1] === 0x0a) {
        const sorted = [[0, timers[0]], [1, timers[1]]].sort((a, b) => a[1][0] - b[1][0]);
        const [id, d] = sorted[f[2]]; reply([0xaa, 0x0a, id, ...d, ...zeros(12), 0]);
      }
      if (f[0] === 0xaa && f[1] === 0x05) reply([0xaa, 0x05, 4, 1, ...zeros(16)]);
    },
  };
  const notifyChar = { addEventListener(_, cb) { notify = cb; }, async startNotifications() {} };
  const svc = { async getCharacteristic(u) { return u.endsWith('2b11') ? writeChar : notifyChar; } };
  const server = { async getPrimaryService() { return svc; } };
  const advListeners = []; let watched = 0;
  const dev = { name: 'Minger_H6001_TEST', id: 'abc', addEventListener(t, f) { if (t === 'advertisementreceived') advListeners.push(f); }, removeEventListener() {}, gatt: { async connect() { if (opt.unreachable) throw new Error('GATT Server is disconnected.'); return server; }, disconnect() {} } };

  if (opt.advert) dev.watchAdvertisements = async () => { watched++; if (opt.advert === 'sends') setTimeout(() => advListeners.forEach(f => f({})), 5); };
  let requested = 0; const clicks = []; let onLoad = null;
  const bt = opt.noBluetooth ? undefined : { async requestDevice() { requested++; return dev; } };
  if (bt && !opt.noGetDevices) bt.getDevices = async () => (opt.devices === undefined ? [dev] : opt.devices);
  const ctx = {
    document: { getElementById: mk, addEventListener(t, f) { if (t === 'click') clicks.push(f); }, createRange() { return { selectNodeContents() {} }; }, execCommand() { return true; } },
    getSelection() { return { removeAllRanges() {}, addRange() {} }; },
    navigator: { bluetooth: bt, userAgent: opt.ua || 'Chrome/140', userAgentData: opt.brands ? { brands: opt.brands } : undefined, clipboard: { async writeText() {} } },
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener(t, f) { if (t === 'load') onLoad = f; },
    setTimeout, setInterval: () => 0, console, Date, Promise, Uint8Array, Math, Number, Array, parseInt, Set,
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { els, sent, clicks, timers, dev, get requested() { return requested; }, get watched() { return watched; }, start: async () => { await onLoad(); await wait(30); } };
}

test('connects automatically to a known device, sets the clock and loads the stored timer', async () => {
  const p = makePage(); await p.start();
  assert.match(p.els.status.textContent, /^Connected to Minger_H6001_TEST\. Bulb clock set to/);
  assert.equal(p.els.connect.textContent, 'Disconnect');
  assert.equal(p.els.save.disabled, false);
  assert.equal([p.els.tstart.value, p.els.tend.value].join(' '), '21:00 21:38');
  assert.equal(p.els.tactive.checked, true);
  assert.equal(p.sent.filter(f => f[0] === 0x33 && f[1] === 0x09).length, 1, 'exactly one clock packet');
  assert.equal(p.els.warn.hidden, true);
});

test('known device: waits for an advertisement (watchAdvertisements) before connecting', async () => {
  const p = makePage({ advert: 'sends' }); await p.start();
  assert.equal(p.watched, 1);
  assert.match(p.els.status.textContent, /^Connected to Minger_H6001_TEST/);
});

test('known device: still tries to connect if watchAdvertisements() throws or is missing', async () => {
  const p = makePage(); await p.start();      // mock has no watchAdvertisements
  assert.equal(p.watched, 0);
  assert.match(p.els.status.textContent, /^Connected to/);
});

test('no known device: the search button pulses and the first tap opens the chooser', async () => {
  const p = makePage({ devices: [] }); await p.start();
  assert.match(p.els.status.textContent, /No known device found\. The next tap opens the search\./);
  assert.ok(p.els.search.classList.s.has('pulse'));
  assert.equal(p.requested, 0);
  await p.clicks[0]({ target: { closest: () => null } }); await wait(2500);
  assert.equal(p.requested, 1);
  assert.match(p.els.status.textContent, /^Connected to/);
});

test('getDevices() missing: falls back to the tap-to-search path', async () => {
  const p = makePage({ noGetDevices: true }); await p.start();
  assert.match(p.els.status.textContent, /Automatic reconnection is not available/);
  assert.ok(p.els.search.classList.s.has('pulse'));
});

test('known device unreachable: shows a message and does not open the chooser', async () => {
  const p = makePage({ unreachable: true }); await p.start();
  assert.match(p.els.status.textContent, /Bulb not reachable/);
  assert.equal(p.requested, 0);
  assert.equal(p.els.save.disabled, true);
});

test('browser without Web Bluetooth: red warning and disabled buttons', async () => {
  const p = makePage({ noBluetooth: true, ua: 'Firefox/130' }); await p.start();
  assert.equal(p.els.warn.hidden, false);
  assert.equal(p.els.warn.className, 'err');
  assert.match(p.els.warn.textContent, /only works in Google Chrome/);
  assert.equal(p.els.connect.disabled, true);
});

test('Chromium browser that is not Chrome: soft warning only', async () => {
  const p = makePage({ brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }] }); await p.start();
  assert.equal(p.els.warn.className, 'soft');
  assert.match(p.els.warn.textContent, /only been tested in Google Chrome/);
});

test('saving writes clock, timer (slot 1) and scene, then verifies by read-back', async () => {
  const p = makePage(); await p.start();
  p.els.tstart.value = '06:30'; p.els.tend.value = '07:20'; p.els.tactive.checked = true; p.els.scene.value = '0';
  p.sent.length = 0;
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'ok', p.els.result.textContent);
  assert.match(p.els.result.textContent, /Saved and read back: 06:30 to 07:20, enabled\. Scene: sunrise\./);
  const kinds = p.sent.filter(f => !(f[0] === 0xaa && f[1] === 0x01)).map(f => f.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  assert.ok(kinds[0].startsWith('33 09'), 'clock first: ' + kinds[0]);
  assert.equal(kinds[1], '33 0a 01 06 1e 07 14 01');
  assert.equal(kinds[2], '33 05 04 00 00 00 00 00');
});

test('a timer that the bulb silently discards is reported as an error', async () => {
  const p = makePage({ rejectTimerWrites: true }); await p.start();
  p.els.tstart.value = '06:30'; p.els.tend.value = '07:20';
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'bad');
  assert.match(p.els.result.textContent, /did NOT accept the timer/);
});

test('start equal to end is refused before anything is sent', async () => {
  const p = makePage(); await p.start();
  p.els.tstart.value = '07:00'; p.els.tend.value = '07:00';
  p.sent.length = 0;
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'bad');
  assert.equal(p.sent.filter(f => f[0] === 0x33).length, 0);
});
