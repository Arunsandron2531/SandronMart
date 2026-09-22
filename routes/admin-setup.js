const express = require('express');
const db = require('../config/db');
const { getAdminCount, createAdminAccount } = require('../config/admin-setup');
const { validateAdminSetup } = require('../utils/validators');

const router = express.Router();

// First-run setup: creates the store's single admin account from the details
// the administrator enters on this page. It is only offered before any admin
// account exists - once one has been created it redirects back to the normal
// admin login form, so no duplicate admin can ever be created.
function adminExists() {
  return getAdminCount(db) > 0;
}

router.get('/admin/setup', (req, res) => {
  if (adminExists()) {
    return res.redirect('/login?admin=1');
  }
  res.render('admin-setup', {
    title: 'Set Up Admin Account',
    form: {},
    errors: {},
  });
});

router.post('/admin/setup', (req, res) => {
  if (adminExists()) {
    return res.redirect('/login?admin=1');
  }

  const form = {
    fullName: (req.body.fullName || '').trim(),
    email: (req.body.email || '').trim(),
    phone: (req.body.phone || '').trim(),
    password: req.body.password || '',
    confirmPassword: req.body.confirmPassword || '',
  };

  const errors = validateAdminSetup(form);

  if (form.email) {
    const taken = db.prepare('SELECT 1 FROM users WHERE email = ?').get(form.email.toLowerCase());
    if (taken) {
      errors.email = errors.email || [];
      errors.email.push('An account with this email already exists');
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('admin-setup', {
      title: 'Set Up Admin Account',
      form,
      errors,
    });
  }

  createAdminAccount(db, form);
  return res.redirect(`/login?admin=1&setup=1&email=${encodeURIComponent(form.email)}`);
});

module.exports = router;