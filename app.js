const express = require('express');
const session = require('express-session');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./config/db');
const shop = require('./config/shop');
const { formatINR, formatINRNumber } = require('./utils/currency');
const {
  formatDateRange,
  formatDayMonth,
  formatLongDate,
  computeDeliveryWindow,
  statusLabel,
} = require('./utils/delivery');
const { productImage, defaultProductImage } = require('./utils/product-images');

const app = express();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hosting platforms (Render, Heroku, etc.) terminate HTTPS at a proxy and
// forward the original protocol via the X-Forwarded-Proto header. Trusting the
// (single) proxy lets Express produce correct URLs and secure session cookies.
if (isProduction) {
  app.set('trust proxy', 1);
}

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
    // Session rows live in SQLite (sessions table created in the same database
    // file as the app data). On Render, point DB_PATH at a mounted disk so
    // sessions survive restarts; this avoids the non-production MemoryStore.
    store: new BetterSqlite3Store({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session && req.session.userId
    ? { name: req.session.name, email: req.session.email, role: req.session.role }
    : null;
  res.locals.cartCount = 0;
  res.locals.shop = shop;
  res.locals.formatINR = formatINR;
  res.locals.formatINRNumber = formatINRNumber;
  res.locals.formatDateRange = formatDateRange;
  res.locals.formatDayMonth = formatDayMonth;
  res.locals.formatLongDate = formatLongDate;
  res.locals.computeDeliveryWindow = computeDeliveryWindow;
  res.locals.statusLabel = statusLabel;
  res.locals.productImage = productImage;
  res.locals.defaultProductImage = defaultProductImage;
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
app.use('/', require('./routes/orders'));
app.use('/', require('./routes/admin-setup'));
app.use('/', require('./routes/admin'));

// Health check for the hosting platform / uptime monitors.
app.get('/health', (req, res) => {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch (error) {
    console.error('health check DB probe failed:', error.message);
  }
  res.status(dbOk ? 200 : 500).json({ status: dbOk ? 'ok' : 'error' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not Found' });
});

app.use((err, req, res, next) => {
  if (err) {
    console.error(err);
  }
  res.status(500).render('500', { title: 'Server Error' });
});

module.exports = app;