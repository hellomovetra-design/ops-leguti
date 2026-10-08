const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const m = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/employee-employment.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: m, exports: m.exports });
const { employeeEmployment, EMPLOYMENT_LABELS } = m.exports;
for (const [value, expected] of [['PKWTT','permanent'],[' tetap ','permanent'],['PKWT','contract'],['Outsourcing','outsource'],['alih daya','outsource'],['FREELANCE','outsource'],['Freelancer','outsource'],['FL','outsource'],['Aktif','unknown'],['Nonaktif','unknown'],['Resign','unknown'],['','unknown'],[null,'unknown']]) {
  assert.equal(employeeEmployment({ employment: value }), expected);
}
assert.equal(employeeEmployment({ employment: 'FREELANCE', nik: 'TGRFL123' }), 'outsource');
assert.equal(employeeEmployment({ employment: 'PKWTT', active: false }), 'permanent');
assert.equal(Object.keys(EMPLOYMENT_LABELS).length, 4);
assert.equal('freelance' in EMPLOYMENT_LABELS, false);
const row = { employment: 'FREELANCE' };
employeeEmployment(row);
assert.equal(row.employment, 'FREELANCE', 'Display grouping must not mutate stored contract type');
const source = fs.readFileSync('components/employee-dashboard.tsx', 'utf8');
assert.ok(source.includes('employmentRows=employmentFilter==='));
assert.ok(source.includes('filtered.slice(0,visibleCount)'));
assert.ok(source.includes('<th>Kepegawaian</th>'));
console.log('PASS: freelance grouped as outsource, no standalone freelance category, original data preserved, independent lifecycle status and dashboard filters.');
