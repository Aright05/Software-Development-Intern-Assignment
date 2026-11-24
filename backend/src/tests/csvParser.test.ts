import assert from 'assert';
import { parseEmailList } from '../../../frontend/src/utils/csvParser';
import { formatRelativeTime, toDatetimeLocal } from '../../../frontend/src/utils/dateFormat';

console.log('\n--- Running Frontend CSV & Formatter Test Suite ---\n');

// 1. Test 100 Email Addresses in CSV
const lines = ['Email,Full Name'];
for (let i = 1; i <= 100; i++) {
  lines.push(`lead${i}@reachinbox.test,Lead Number ${i}`);
}
const csv100 = lines.join('\n');
const result100 = parseEmailList(csv100);

assert.strictEqual(result100.totalParsed, 100, 'Should parse exactly 100 rows');
assert.strictEqual(result100.validRecipients.length, 100, 'All 100 rows should be valid');
assert.strictEqual(result100.duplicateCount, 0, 'Zero duplicates expected');
assert.strictEqual(result100.invalidCount, 0, 'Zero invalid entries expected');
console.log('  ✓ 100-recipient CSV parsed with 100% validity');

// 2. Test Invalid Email Syntax
const invalidCsv = `
not-an-email
user@
@domain.com
missing-tld@domain
valid@domain.com
`;
const resultInvalid = parseEmailList(invalidCsv);
assert.strictEqual(resultInvalid.validRecipients.length, 1, 'Only 1 valid email expected');
assert.strictEqual(resultInvalid.invalidCount, 4, '4 invalid emails expected');
console.log('  ✓ Invalid email formats successfully flagged and isolated');

// 3. Test Duplicates (Case insensitive)
const duplicateCsv = `
CEO@company.com
cto@company.com
ceo@company.com
CEO@COMPANY.COM
`;
const resultDup = parseEmailList(duplicateCsv);
assert.strictEqual(resultDup.validRecipients.length, 2, 'Expected 2 unique valid emails');
assert.strictEqual(resultDup.duplicateCount, 2, 'Expected 2 duplicates filtered');
console.log('  ✓ Case-insensitive duplicate detection validated');

// 4. Test Date Formatter Utilities
const pastDate = new Date(Date.now() - 3600000).toISOString();
const relPast = formatRelativeTime(pastDate);
assert(relPast.includes('h ago') || relPast === '1h ago', 'Should format relative past time');

const futureDate = new Date(Date.now() + 7200000).toISOString();
const relFuture = formatRelativeTime(futureDate);
assert(relFuture.includes('in 2h') || relFuture.includes('in 1h'), 'Should format relative future time');

const localString = toDatetimeLocal(new Date('2026-11-24T12:30:00Z'));
assert(localString.includes('2026-11-24'), 'Should output YYYY-MM-DD');

console.log('  ✓ Date formatters (relative, absolute, datetime-local) verified');

console.log('\n--- Frontend CSV & Formatter Suite: All tests passed ---\n');
process.exit(0);
