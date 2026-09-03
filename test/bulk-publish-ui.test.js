const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const asset of ['admin-main.js', 'teacher-main.js']) {
  test(`${asset} publishes results by subject instead of individual student`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', asset), 'utf8');
    assert.match(source, /data-publish-set=/);
    assert.match(source, /apiPublishAllForSet\(button\.dataset\.publishSet\)/);
    assert.doesNotMatch(source, /data-togglepub=/);
    assert.match(source, /function resultScoreColumns\(/);
    assert.match(source, /columns\.matching\?(?:'<th>จับคู่<\/th>'|`<th>\$\{tr\('จับคู่'\)\}<\/th>`):''/);
    assert.match(source, /class="result-row-actions"/);
  });
}
