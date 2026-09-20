const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { validateLogin, validateRegister } = require('../utils/validators');

const router = express.Router();

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

function emailTaken(email) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.trim().toLowerCase()));
}

router.get('/login', (req, res) => {
  res.render('login', {
    title: 'Login',
    errorMessage: req.query.error ? 'Invalid email or password. Please try again.' : null,
    successMessage: req.query.logout
      ? 'You have been logged out successfully.'
      : req.query.registered
        ? 'Account created successfully. Please sign in.'
        : null,
    form: { email: '' },
    errors: {},
  });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  const errors = validateLogin(email, password);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render('login', {
      title: 'Login',
      errors,
      form: { email },
      errorMessage: null,
      successMessage: null,
    });
  }

  const user = findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.redirect('/login?error=1');
  }

  req.session.userId = user.id;
  req.session.name = user.full_name;
  req.session.email = user.email;
  req.session.role = user.role;

  if (user.role === 'SELLER') {
    return res.redirect('/seller/dashboard');
  }
  return res.redirect('/buyer/dashboard');
});

router.get('/register', (req, res) => {
  res.render('register', {
    title: 'Create Account',
    form: {},
    errors: {},
  });
});

router.post('/register', (req, res) => {
  const values = {
    fullName: (req.body.fullName || '').trim(),
    email: (req.body.email || '').trim(),
    phone: (req.body.phone || '').trim(),
    password: req.body.password || '',
    confirmPassword: req.body.confirmPassword || '',
    role: req.body.role || '',
  };

  const errors = validateRegister(values);

  if (values.email && emailTaken(values.email)) {
    errors.email = errors.email || [];
    errors.email.push('An account with this email already exists');
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('register', {
      title: 'Create Account',
      form: values,
      errors,
    });
  }

  const hashedPassword = bcrypt.hashSync(values.password, 10);

  db.prepare(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(values.fullName, values.email.toLowerCase(), values.phone, hashedPassword, values.role);

  return res.redirect('/login?registered=1');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login?logout=1');
  });
});

module.exports = router;