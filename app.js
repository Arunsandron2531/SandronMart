const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./config/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const secretFile = path.join(__dirname, 'data', '.session-secret');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (!fs.existsSync(secretFile)) {
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'));
  }
  sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
}

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session && req.session.userId
    ? { name: req.session.name, email: req.session.email, role: req.session.role }
    : null;
  res.locals.cartCount = 0;
  if (res.locals.currentUser && res.locals.currentUser.role === 'BUYER') {
    const row = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS count FROM cart_items WHERE buyer_id = ?'
    ).get(req.session.userId);
    res.locals.cartCount = row.count;
  }
  next();
});

app.use('/', require('./routes/pages'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/buyer'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/products'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Server Error' });
});

module.exports = app;