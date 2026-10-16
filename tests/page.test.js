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
const DAYS = [0, 1, 2, 3, 4, 5, 6].map(d => 'alday' + d);
const IDS = ['connect', 'search', 'tstart', 'tdur', 'tdurcustom', 'tactive', 'scene', 'save', 'readback', 'sunsetnow', 'on', 'off', 'bright', 'hue', 'sat',
  'alon', 'alwarn', 'altime', 'aldur', 'alscene', 'alapply', 'alstatus', ...DAYS,
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
  els.scene.value = '0'; els.tstart.value = '08:00'; els.bright.value = '255';
  const okDur = new Set(['15', '30', '45', '60', '75', '90', '105', '120', '135', '150', '165', '180']);
  let durVal = '45';                                    // a <select> keeps only values that exist as options
  Object.defineProperty(els.tdur, 'value', { get() { return durVal; }, set(v) { durVal = (okDur.has(String(v)) || String(v) === els.tdurcustom.value) ? String(v) : ''; } });
  els.aldur.value = '45'; els.altime.value = '06:30'; els.alscene.value = '0';
  els.warn.hidden = true; els.result.hidden = true; els.alwarn.hidden = true;     // both start hidden in index.html

  const timers = { 0: [9, 0x11, 8, 0x0f, 0], 1: opt.timer1 || [0x15, 0, 0x15, 0x26, 1] };
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
      if (f[0] === 0xaa && f[1] === 0x05) reply([0xaa, 0x05, ...(opt.mode || [4, 1]), ...zeros(15)]);
      if (f[0] === 0xaa && f[1] === 0x04) reply([0xaa, 0x04, 0x80, ...zeros(16)]);
      if (f[0] === 0xaa && f[1] === 0x01) reply([0xaa, 0x01, opt.lit ? 1 : 0, ...zeros(16)]);
    },
  };
  const notifyChar = { addEventListener(_, cb) { notify = cb; }, async startNotifications() {} };
  const svc = { async getCharacteristic(u) { return u.endsWith('2b11') ? writeChar : notifyChar; } };
  const server = { async getPrimaryService() { return svc; } };
  const advListeners = []; let watched = 0;
  const discListeners = []; let disconnects = 0;
  const dev = { name: 'Minger_H6001_TEST', id: 'abc', addEventListener(t, f) { if (t === 'advertisementreceived') advListeners.push(f); if (t === 'gattserverdisconnected') discListeners.push(f); }, removeEventListener() {},
    gatt: { async connect() { if (opt.unreachable) throw new Error('GATT Server is disconnected.'); return server; }, disconnect() { disconnects++; discListeners.forEach(f => f()); } } };

  if (opt.advert) dev.watchAdvertisements = async () => { watched++; if (opt.advert === 'sends') setTimeout(() => advListeners.forEach(f => f({})), 5); };
  let requested = 0; const clicks = []; let onLoad = null;
  const bt = opt.noBluetooth ? undefined : { async requestDevice() { requested++; return dev; } };
  if (bt && !opt.noGetDevices) bt.getDevices = async () => (opt.devices === undefined ? [dev] : opt.devices);
  let cookieJar = opt.cookie || ''; const intervals = []; const docEvents = {}, winEvents = {};
  const channels = [];
  class FakeChannel { constructor(n) { this.name = n; this.posted = []; channels.push(this); } postMessage(m) { this.posted.push(m); } }
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0 && opt.now) super(opt.now); else super(...a); } static now() { return opt.now || RealDate.now(); } }
  const ctx = {
    document: { getElementById: mk, visibilityState: 'visible', get cookie() { return cookieJar; }, set cookie(v) { cookieJar = v.split(';')[0]; }, addEventListener(t, f) { if (t === 'click') clicks.push(f); else docEvents[t] = f; }, createRange() { return { selectNodeContents() {} }; }, execCommand() { return true; } },
    getSelection() { return { removeAllRanges() {}, addRange() {} }; },
    navigator: { bluetooth: bt, userAgent: opt.ua || 'Chrome/140', userAgentData: opt.brands ? { brands: opt.brands } : undefined, clipboard: { async writeText() {} } },
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener(t, f) { if (t === 'load') onLoad = f; else winEvents[t] = f; },
    URLSearchParams,
    location: opt.search !== undefined ? { search: opt.search, protocol: 'https:' } : undefined,
    BroadcastChannel: opt.noChannel ? undefined : FakeChannel,
    setTimeout, setInterval: (f, ms) => { intervals.push([f, ms]); return 0; }, console, Date: FakeDate, Promise, Uint8Array, Math, Number, Array, parseInt, Set,
  };
  ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { els, sent, clicks, timers, dev, channels, intervals, docEvents, winEvents, get cookie() { return cookieJar; }, get disconnects() { return disconnects; }, get requested() { return requested; }, get watched() { return watched; }, start: async () => { await onLoad(); await wait(30); } };
}

test('connects automatically to a known device, sets the clock and loads the stored timer', async () => {
  const p = makePage(); await p.start();
  assert.match(p.els.status.textContent, /^Connected to Minger_H6001_TEST\. Bulb clock set to/);
  assert.equal(p.els.connect.textContent, 'Disconnect');
  assert.equal(p.els.save.disabled, false);
  assert.equal([p.els.tstart.value, p.els.tdur.value].join(' '), '21:00 38');
  assert.equal(p.els.tdurcustom.hidden, false, 'a stored 38 min window gets its own entry');
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
  p.els.tstart.value = '06:30'; p.els.tdur.value = '60'; p.els.tactive.checked = true; p.els.scene.value = '0';
  p.sent.length = 0;
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'ok', p.els.result.textContent);
  assert.match(p.els.result.textContent, /Saved and read back: 06:30 to 07:30, enabled\. Scene: sunrise\./);
  const kinds = p.sent.filter(f => !(f[0] === 0xaa && f[1] === 0x01)).map(f => f.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  assert.ok(kinds[0].startsWith('33 09'), 'clock first: ' + kinds[0]);
  assert.equal(kinds[1], '33 0a 01 06 1e 07 1e 01');
  assert.equal(kinds[2], '33 05 04 00 00 00 00 00');
});

test('a timer that the bulb silently discards is reported as an error', async () => {
  const p = makePage({ rejectTimerWrites: true }); await p.start();
  p.els.tstart.value = '06:30'; p.els.tdur.value = '45';
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'bad');
  assert.match(p.els.result.textContent, /did NOT accept the timer/);
});

test('a missing duration is refused before anything is sent', async () => {
  const p = makePage(); await p.start();
  p.els.tstart.value = '07:00'; p.els.tdur.value = '';
  p.sent.length = 0;
  await p.els.save.onclick();
  assert.equal(p.els.result.className, 'bad');
  assert.equal(p.sent.filter(f => f[0] === 0x33).length, 0);
});

// ---------- light, timer scenes, sunset now, URL action, single instance ----------
const hx = f => f.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ');
const frames = p => p.sent.filter(f => !(f[0] === 0xaa && f[1] === 0x01)).map(hx);
async function until(fn, ms = 20000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await wait(50); } }

test('On reads brightness and colour from the bulb and moves the sliders', async () => {
  const p = makePage({ mode: [2, 0, 0xff, 0] }); await p.start();
  p.els.bright.value = '10'; p.els.hue.value = '300'; p.els.sat.value = '5';
  await p.els.on.onclick();
  assert.equal(p.els.bright.value, '128');
  assert.equal(p.els.hue.value, '120');
  assert.equal(p.els.sat.value, '100');
});

test('On in a scene: brightness follows, colour sliders stay, scene select follows', async () => {
  const p = makePage({ mode: [4, 0] }); await p.start();
  p.els.hue.value = '300'; p.els.sat.value = '5';
  await p.els.on.onclick();
  assert.equal(p.els.hue.value, '300');
  assert.equal(p.els.sat.value, '5');
  assert.equal(p.els.scene.value, '0');
});

test('timer scene "On" sends a plain colour and brightness instead of an animation', async () => {
  const p = makePage(); await p.start();
  p.els.tstart.value = '18:00'; p.els.tdur.value = '120'; p.els.scene.value = '2'; p.els.bright.value = '200';
  p.els.hue.value = '0'; p.els.sat.value = '0';
  p.sent.length = 0;
  await p.els.save.onclick();
  const k = frames(p);
  assert.ok(k.includes('33 0a 01 12 00 14 00 01'), k.join('|'));
  assert.ok(k.includes('33 05 02 ff ff ff 00 00'));
  assert.ok(k.includes('33 04 c8 00 00 00 00 00'));
  assert.ok(!k.some(f => f.startsWith('33 05 04')));
  assert.match(p.els.result.textContent, /Scene: on/);
});

test('a window that wraps past midnight gets the right end time', async () => {
  const p = makePage(); await p.start();
  p.els.tstart.value = '23:30'; p.els.tdur.value = '90';
  p.sent.length = 0;
  await p.els.save.onclick();
  assert.ok(frames(p).includes('33 0a 01 17 1e 01 00 01'));
});

test('Sunset now selects the sunset scene, switches on and checks the reply', async () => {
  const p = makePage(); await p.start();
  p.sent.length = 0;
  await p.els.sunsetnow.onclick();
  const k = frames(p);
  assert.ok(k.indexOf('33 05 04 01 00 00 00 00') >= 0 && k.indexOf('33 01 01 00 00 00 00 00') > k.indexOf('33 05 04 01 00 00 00 00'));
  assert.equal(p.els.result.className, 'ok', p.els.result.textContent);
});

test('Sunset now reports when the bulb does not show the sunset scene', async () => {
  const p = makePage({ mode: [4, 0] }); await p.start();
  await p.els.sunsetnow.onclick();
  assert.equal(p.els.result.className, 'bad');
  assert.match(p.els.result.textContent, /did not report the sunset scene/);
});

test('?action=sunset starts the sunset once the bulb is connected', async () => {
  const p = makePage({ search: '?action=sunset' }); await p.start();
  assert.ok(frames(p).includes('33 05 04 01 00 00 00 00'));
  assert.equal(p.els.result.className, 'ok');
});

test('without the URL option no sunset is started', async () => {
  const p = makePage({ search: '' }); await p.start();
  assert.ok(!frames(p).includes('33 05 04 01 00 00 00 00'));
});

test('single instance: a claim from another page disconnects; own claims are ignored', async () => {
  const p = makePage(); await p.start();
  const ch = p.channels[0];
  assert.equal(ch.posted[0].type, 'claim', 'the page claims the bulb at start');
  ch.onmessage({ data: { type: 'claim', id: ch.posted[0].id } });
  assert.equal(p.disconnects, 0);
  ch.onmessage({ data: { type: 'claim', id: 'someone-else' } });
  assert.equal(p.disconnects, 1);
  assert.match(p.els.status.textContent, /Another page took over the bulb/);
  assert.equal(p.els.save.disabled, true);
});

test('the page still works where BroadcastChannel does not exist', async () => {
  const p = makePage({ noChannel: true }); await p.start();
  assert.match(p.els.status.textContent, /^Connected to/);
});

// ---------- alarm ----------
const ALARM = { on: true, time: '06:30', dur: 45, scene: 0, days: [false, true, true, true, true, true, false], last: '' };
const cookieOf = a => 'h6001.alarm=' + encodeURIComponent(JSON.stringify(a));
const at = (d, h, m) => new Date(2026, 9, d, h, m, 0).getTime();     // October 2026: 20th is a Tuesday

test('alarm settings are restored from the cookie', async () => {
  const p = makePage({ cookie: cookieOf({ ...ALARM, time: '05:15', dur: 90, scene: 1 }), now: at(20, 20, 0) }); await p.start();
  assert.equal(p.els.alon.checked, true);
  assert.equal(p.els.altime.value, '05:15');
  assert.equal(p.els.aldur.value, '90');
  assert.equal(p.els.alscene.value, '1');
  assert.equal(p.els.alday1.checked, true);
  assert.equal(p.els.alday0.checked, false);
  assert.match(p.els.alstatus.textContent, /^Next: Wed 2026-10-21 05:15, sunset, 90 min\./);
});

test('changed alarm settings are written to the cookie', async () => {
  const p = makePage({ now: at(20, 20, 0) }); await p.start();
  p.els.alon.checked = true; p.els.altime.value = '05:15'; p.els.alday0.checked = true; p.els.alday1.checked = false;
  p.els.alon.onchange();
  assert.match(p.cookie, /^h6001\.alarm=/);
  const o = JSON.parse(decodeURIComponent(p.cookie.split('=')[1]));
  assert.equal(o.on, true); assert.equal(o.time, '05:15'); assert.equal(o.days[0], true); assert.equal(o.days[1], false);
});

test('alarm on connect: next start on a selected weekday enables the timer and sets the scene', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(20, 20, 0) }); await p.start();    // Tuesday evening, next start Wednesday
  await until(() => /Timer written/.test(p.els.alstatus.textContent));
  const k = frames(p);
  assert.ok(k.includes('33 0a 01 06 1e 07 0f 01'), k.join('|'));
  assert.ok(k.includes('33 05 04 00 00 00 00 00'));
  assert.deepEqual(p.timers[1], [6, 30, 7, 15, 1]);
});

test('alarm on connect: next start on an unselected weekday disables the timer and leaves the scene alone', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(23, 20, 0) }); await p.start();    // Friday evening, next start Saturday
  await until(() => /Timer written/.test(p.els.alstatus.textContent));
  const k = frames(p);
  assert.ok(k.includes('33 0a 01 06 1e 07 0f 00'), k.join('|'));
  assert.ok(!k.some(f => f.startsWith('33 05 04')));
  assert.deepEqual(p.timers[1], [6, 30, 7, 15, 0]);
});

test('alarm: after the last selected day the timer is disabled in the night (check after 02:00)', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(24, 2, 30) }); await p.start();    // Saturday 02:30
  await until(() => /Timer written/.test(p.els.alstatus.textContent));
  assert.deepEqual(p.timers[1], [6, 30, 7, 15, 0]);
  assert.match(p.els.alstatus.textContent, /Last check: 2026-10-24/);
});

test('alarm never touches the timer while its window is running', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(21, 6, 40) }); await p.start();
  await until(() => /window is running/.test(p.els.alstatus.textContent));
  assert.ok(!frames(p).some(f => f.startsWith('33 0a')));
});

test('alarm: a lit bulb gets the timer but not a scene change', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(20, 20, 0), lit: true }); await p.start();
  await until(() => /Timer written/.test(p.els.alstatus.textContent));
  assert.ok(!frames(p).some(f => f.startsWith('33 05 04')));
  assert.match(p.els.alstatus.textContent, /lit, scene not changed/);
});

test('alarm: a correct timer is left alone, a wrong scene is corrected', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(20, 20, 0), timer1: [6, 30, 7, 15, 1] }); await p.start();   // bulb reports scene 1, alarm wants 0
  await until(() => /Scene set/.test(p.els.alstatus.textContent));
  const k = frames(p);
  assert.ok(!k.some(f => f.startsWith('33 0a')));
  assert.ok(k.includes('33 05 04 00 00 00 00 00'));
});

test('alarm: correct timer and scene means no write at all', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(20, 20, 0), timer1: [6, 30, 7, 15, 1], mode: [4, 0] }); await p.start();
  await until(() => /already correct/.test(p.els.alstatus.textContent));
  assert.ok(!frames(p).some(f => f.startsWith('33 0a') || f.startsWith('33 05')));
});

test('alarm: nothing is written while the alarm is off', async () => {
  const p = makePage({ cookie: cookieOf({ ...ALARM, on: false }), now: at(20, 20, 0) }); await p.start();
  await wait(1200);
  assert.ok(!frames(p).some(f => f.startsWith('33 0a')));
  assert.match(p.els.alstatus.textContent, /^Alarm is off/);
});

test('alarm without a known bulb does not try to open the chooser by itself', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(25, 3, 0), noGetDevices: true }); await p.start();
  const tick = p.intervals.find(i => i[1] === 3600000)[0];
  await tick();
  assert.match(p.els.alstatus.textContent, /No known bulb yet/);
  assert.equal(p.requested, 0);
});

test('daily check: runs once per day, not before 02:00', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(21, 1, 30) }); await p.start();
  await until(() => /Timer written/.test(p.els.alstatus.textContent));      // the connection check ran
  assert.doesNotMatch(p.els.alstatus.textContent, /Last check/, 'before 02:00 the day is not marked as checked');
});

test('closing warning: asked only while the weekday selection needs the page', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(21, 6, 40) }); await p.start();        // Mon-Fri selected, alarm active
  const ev = { prevented: false, preventDefault() { this.prevented = true; }, returnValue: undefined };
  p.winEvents.beforeunload(ev);
  assert.equal(ev.prevented, true);
  assert.equal(ev.returnValue, '');
  const off = makePage({ cookie: cookieOf({ ...ALARM, on: false }) }); await off.start();
  const e2 = { prevented: false, preventDefault() { this.prevented = true; } };
  off.winEvents.beforeunload(e2);
  assert.equal(e2.prevented, false, 'alarm off: no warning');
  const all = makePage({ cookie: cookieOf({ ...ALARM, days: new Array(7).fill(true) }), now: at(21, 6, 40) }); await all.start();
  const e3 = { prevented: false, preventDefault() { this.prevented = true; } };
  all.winEvents.beforeunload(e3);
  assert.equal(e3.prevented, false, 'all seven days: the page is not needed');
});

test('closing warning: not asked by a page that gave the bulb to another page', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(21, 6, 40) }); await p.start();
  p.channels[0].onmessage({ data: { type: 'claim', id: 'someone-else' } });
  const ev = { prevented: false, preventDefault() { this.prevented = true; } };
  p.winEvents.beforeunload(ev);
  assert.equal(ev.prevented, false);
});

test('the alarm check also runs when the page becomes visible again', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(25, 3, 0), noGetDevices: true }); await p.start();
  await p.docEvents.visibilitychange();
  assert.match(p.els.alstatus.textContent, /No known bulb yet/);
});

test('"you must leave this tab open" shows next to Alarm only while the weekday selection needs the page', async () => {
  const p = makePage({ cookie: cookieOf(ALARM), now: at(21, 6, 40) }); await p.start();
  assert.equal(p.els.alwarn.hidden, false);
  p.els.alon.checked = false; p.els.alon.onchange();
  assert.equal(p.els.alwarn.hidden, true, 'alarm off');
  p.els.alon.checked = true; for (let d = 0; d < 7; d++) p.els['alday' + d].checked = true; p.els.alon.onchange();
  assert.equal(p.els.alwarn.hidden, true, 'all seven days');
  p.els.alday0.checked = false; p.els.alon.onchange();
  assert.equal(p.els.alwarn.hidden, false, 'six days');
});
