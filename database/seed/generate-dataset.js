'use strict';
/* Writes the Group Finance Portal demonstration dataset as JSON for the SQL Server seed scripts.
   Runs the portal's original browser generator (data.js, unchanged) in a sandbox with the Qatar time zone,
   so the databases hold exactly the data the stand-alone portal showed, dated relative to today.
   Usage: node generate-dataset.js <output.json> [YYYY-MM-DD] */
process.env.TZ = 'Asia/Qatar';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [, , outFile, asOf] = process.argv;
if (!outFile) {
  console.error('usage: node generate-dataset.js <output.json> [YYYY-MM-DD]');
  process.exit(2);
}

let DateImpl = Date;
if (asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error('The as-of date must be YYYY-MM-DD.');
    process.exit(2);
  }
  const fixed = new Date(`${asOf}T09:00:00+03:00`).getTime();
  DateImpl = class extends Date {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }
    static now() { return fixed; }
  };
}

const sandbox = { window: {}, Date: DateImpl };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const data = sandbox.window.ATH && sandbox.window.ATH.data;
if (!data || !Array.isArray(data.invoices) || !data.invoices.length) {
  console.error('data.js did not produce a dataset.');
  process.exit(1);
}

// SQL Server cannot read the key order of a JSON object reliably, so record it for the seed scripts.
const output = Object.assign({}, data, { _order: { people: Object.keys(data.people), categories: Object.keys(data.categories) } });
fs.writeFileSync(outFile, JSON.stringify(output), 'utf8');
console.log(`dataset as of ${data.today}: ${data.entities.length} entities, ${data.vendors.length} vendors, ${data.invoices.length} invoices, ` +
  `${data.receivables.length} receivables, ${data.accounts.length} bank accounts, ${data.paymentRuns.length} payment runs, ` +
  `${data.approvals.length} approvals, ${data.audit.length} audit entries`);
