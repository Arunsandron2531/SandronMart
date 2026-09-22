const bcrypt = require('bcryptjs');

function getAdminCount(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'").get().c;
}

// Creates the store's first (and only) admin account from the details the
// administrator enters during the initial setup. A password is always chosen by
// the administrator and stored as a bcrypt hash - no default account or
// hardcoded credentials are ever seeded. The call is a no-op whenever an admin
// already exists, so revisiting the setup page can never create a duplicate.
function createAdminAccount(db, form) {
  if (getAdminCount(db) > 0) {
    return { created: false };
  }

  const info = db.prepare(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(
    form.fullName.trim(),
    form.email.trim().toLowerCase(),
    form.phone.trim(),
    bcrypt.hashSync(form.password, 10),
    'ADMIN'
  );

  return { created: true, id: info.lastInsertRowid };
}

module.exports = {
  getAdminCount,
  createAdminAccount,
};