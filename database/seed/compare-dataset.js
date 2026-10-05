'use strict';
/* Proves the portal serves the same data as the stand-alone portal: compares the generated dataset
   (expected) with the JSON the portal builds from SQL Server and the treasury service (actual).
   Numbers may differ by less than 0.005, timestamps are compared as instants, null equals a missing value,
   and fields the portal adds (for example platform information) are ignored.
   Usage: node compare-dataset.js <expected.json> <actual.json> */
const fs = require('fs');

const [, , expectedFile, actualFile] = process.argv;
if (!expectedFile || !actualFile) {
  console.error('usage: node compare-dataset.js <expected.json> <actual.json>');
  process.exit(2);
}
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const expected = read(expectedFile);
const actual = read(actualFile);

// Category settings that only drive the generator are not part of the portal's data model.
const IGNORED = [/^categories\.[^.]+\.(min|max|terms|lines)/];
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const differences = [];
let compared = 0;

function same(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.005;
  if (typeof a === 'string' && typeof b === 'string' && ISO_TIME.test(a) && ISO_TIME.test(b)) return Date.parse(a) === Date.parse(b);
  return a === b;
}

function walk(exp, act, path) {
  if (differences.length >= 25) return;
  if (path.startsWith('_') || IGNORED.some((re) => re.test(path))) return;
  const missing = (v) => v === null || v === undefined;
  if (missing(exp) || missing(act)) {
    compared += 1;
    if (!(missing(exp) && missing(act))) differences.push(`${path}: expected ${JSON.stringify(exp)}, actual ${JSON.stringify(act)}`);
    return;
  }
  if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) {
      differences.push(`${path}: expected an array of ${exp.length}, actual ${Array.isArray(act) ? 'an array of ' + act.length : typeof act}`);
      return;
    }
    exp.forEach((item, i) => walk(item, act[i], `${path}[${i}]`));
    return;
  }
  if (typeof exp === 'object') {
    if (typeof act !== 'object' || Array.isArray(act)) {
      differences.push(`${path}: expected an object, actual ${JSON.stringify(act)}`);
      return;
    }
    Object.keys(exp).forEach((key) => walk(exp[key], act[key], path ? `${path}.${key}` : key));
    return;
  }
  compared += 1;
  if (!same(exp, act)) differences.push(`${path}: expected ${JSON.stringify(exp)}, actual ${JSON.stringify(act)}`);
}

walk(expected, actual, '');
if (differences.length) {
  console.log(`PARITY_FAILED (${differences.length}${differences.length >= 25 ? '+' : ''} differences):`);
  differences.forEach((d) => console.log('  ' + d));
  process.exit(1);
}
console.log(`PARITY_OK (${compared} values compared)`);
