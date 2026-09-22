const bcrypt = require('bcryptjs');

const ADMIN_EMAIL = 'admin@sandronmart.com';
const ADMIN_PASSWORD = 'admin123';

// Creates the default admin account once. It is a no-op whenever an account
// with the admin email already exists, so starting the server repeatedly never
// creates duplicate admins and never touches other users.
function ensureAdminUser(db) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (existing) {
    return { created: false, id: existing.id };
  }

  const info = db.prepare(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(
    'Admin',
    ADMIN_EMAIL,
    '+910000000000',
    bcrypt.hashSync(ADMIN_PASSWORD, 10),
    'ADMIN'
  );

  return { created: true, id: info.lastInsertRowid };
}

module.exports = {
  ensureAdminUser,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
};