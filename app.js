const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

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
  next();
});

app.use('/', require('./routes/pages'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/products'));

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Server Error' });
});

module.exports = app;