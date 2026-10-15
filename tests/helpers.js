'use strict';
// Loads the pure protocol functions out of an HTML file. The functions live
// between the markers "// ==PURE-START==" and "// ==PURE-END==". Do not move
// or rename these markers in the HTML files or the tests will fail.
const fs = require('fs');
const path = require('path');

const NAMES = ['SERVICE_UUID', 'CHAR_WRITE', 'CHAR_NOTIFY', 'TIMER_SLOT', 'frame', 'hex', 'parseHex',
  'timeFrame', 'timerFrame', 'decodeTimer', 'sameTimer', 'hsvToRgb', 'browserKind'];

function readHtml(file) {
  return fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
}

function loadPure(file) {
  const html = readHtml(file);
  const m = html.match(/\/\/ ==PURE-START==([\s\S]*?)\/\/ ==PURE-END==/);
  if (!m) throw new Error('PURE markers not found in ' + file);
  const ret = NAMES.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  return new Function(m[1] + '\n; return {' + ret + '};')();
}

function scriptOf(file) {
  const html = readHtml(file);
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('script block not found in ' + file);
  return m[1];
}

module.exports = { loadPure, readHtml, scriptOf };
