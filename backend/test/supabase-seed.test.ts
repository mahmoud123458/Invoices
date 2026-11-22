const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

test('Supabase seed admin and staff passwords match demo credentials', async () => {
  const seedSql = readFileSync(join(process.cwd(), 'supabase', 'seed.sql'), 'utf8');

  const adminMatch = seedSql.match(
    /\('usr_admin_01',[^]*?'([^']+\$[^']+)', 'admin'\)/
  );
  const staffMatch = seedSql.match(
    /\('usr_staff_02',[^]*?'([^']+\$[^']+)', 'user'\)/
  );

  assert.ok(adminMatch, 'Admin seed account must have a bcrypt password hash');
  assert.ok(staffMatch, 'Staff seed account must have a bcrypt password hash');
  assert.equal(await bcrypt.compare('admin123', adminMatch[1]), true);
  assert.equal(await bcrypt.compare('user123', staffMatch[1]), true);
});
