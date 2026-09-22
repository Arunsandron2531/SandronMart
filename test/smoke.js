const fs = require('fs');
const os = require('os');
const path = require('path');

const testDb = path.join(os.tmpdir(), `sandronmart-smoke-${Date.now()}.db`);
process.env.DB_PATH = testDb;
process.env.SESSION_SECRET = 'smoke-test-secret';
process.env.NODE_ENV = 'test';

const rootDir = path.join(__dirname, '..');

const app = require('../app');
const appDb = require('../config/db');
const { defaultProductImage } = require('../utils/product-images');
const {
  addDays,
  toISODate,
  computeDeliveryWindow,
  formatDayMonth,
  formatDateRange,
} = require('../utils/delivery');

let server;
let baseUrl;
let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

function makeClient() {
  let cookie = '';
  const client = {
    async request(method, url, body) {
      const init = { method, redirect: 'manual' };
      if (body) {
        init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        init.body = new URLSearchParams(body).toString();
      }
      if (cookie) {
        init.headers = Object.assign({}, init.headers, { Cookie: cookie });
      }
      const res = await fetch(baseUrl + url, init);
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) {
        cookie = setCookie.split(';')[0];
      }
      const text = await res.text();
      return { status: res.status, location: res.headers.get('location'), text };
    }
  };
  return client;
}

function validProduct(overrides) {
  return Object.assign({
    name: 'Snake Plant',
    description: 'A hardy low-light indoor plant.',
    category: 'Indoor Plants',
    price: '18.00',
    stock: '12',
    imageUrl: 'https://example.com/snake-plant.jpg',
  }, overrides || {});
}

function extractProductId(html, productName) {
  const cards = html.split('class="product-card"');
  for (const card of cards) {
    if (card.includes(productName)) {
      const match = card.match(/\/seller\/products\/(\d+)\/edit/);
      if (match) {
        return Number(match[1]);
      }
    }
  }
  return null;
}

function extractBuyerProductId(html, productName) {
  const cards = html.split('class="product-card"');
  for (const card of cards) {
    if (card.includes(productName)) {
      const match = card.match(/\/buyer\/products\/(\d+)/);
      if (match) {
        return Number(match[1]);
      }
    }
  }
  return null;
}

function extractCartItemId(html, productName) {
  const rows = html.split('class="cart-item"');
  for (const row of rows) {
    if (row.includes(productName)) {
      const match = row.match(/\/buyer\/cart\/(\d+)\/update/);
      if (match) {
        return Number(match[1]);
      }
    }
  }
  return null;
}

function extractSavedAddressId(html) {
  const match = html.match(/\/buyer\/addresses\/(\d+)\/edit/);
  return match ? Number(match[1]) : null;
}

function extractOrderId(redirectOrHtml) {
  const match = (redirectOrHtml || '').match(/\/buyer\/orders\/(\d+)\/confirmation/);
  return match ? Number(match[1]) : null;
}

async function run() {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`Smoke tests against ${baseUrl}\n`);

  const anon = makeClient();

  let checkoutWindow = null;

  /* --- Delivery date math: month / leap-year / year-boundary correctness --- */
  const baseWindow = computeDeliveryWindow(new Date(2026, 8, 21, 12, 0, 0));
  assert(baseWindow.start === '2026-09-24' && baseWindow.end === '2026-09-28', 'window from 21-Sep-2026 is 24 Sep - 28 Sep', `${baseWindow.start}..${baseWindow.end}`);
  assert(formatDayMonth(baseWindow.start) === '24 Sep' && formatDayMonth(baseWindow.end) === '28 Sep', 'window formatted as e-commerce dates', `${formatDayMonth(baseWindow.start)} - ${formatDayMonth(baseWindow.end)}`);
  assert(formatDateRange(baseWindow.start, baseWindow.end).includes('24 Sep') && formatDateRange(baseWindow.start, baseWindow.end).includes('28 Sep'), 'range label renders as 24 Sep - 28 Sep', formatDateRange(baseWindow.start, baseWindow.end));
  const leapWindow = computeDeliveryWindow(new Date(2024, 1, 26, 12, 0, 0));
  assert(leapWindow.start === '2024-02-29', 'leap year Feb 29 computed correctly', leapWindow.start);
  const eomWindow = computeDeliveryWindow(new Date(2026, 0, 29, 12, 0, 0));
  assert(eomWindow.start === '2026-02-01', 'month boundary computed correctly', eomWindow.start);
  const yearWindow = computeDeliveryWindow(new Date(2026, 11, 30, 12, 0, 0));
  assert(yearWindow.end === '2027-01-06', 'year boundary computed correctly', yearWindow.end);
  assert(toISODate(addDays(new Date(2026, 8, 21, 12, 0, 0), 3)) === '2026-09-24' && toISODate(addDays(new Date(2026, 8, 21, 12, 0, 0), 7)) === '2026-09-28', 'addDays matches 3/7-day delivery window', 'ok');
  assert(computeDeliveryWindow(new Date(2026, 8, 21, 12, 0, 0)).start === '2026-09-24' && computeDeliveryWindow(new Date(2026, 8, 22, 12, 0, 0)).start === '2026-09-25', 'window advances with the current date (21 Sep -> 22 Sep)', 'ok');

  let r = await anon.request('GET', '/');
  assert(r.status === 200 && r.text.includes('SANDRONMART'), 'home page renders SANDRONMART', `status=${r.status}`);
  assert(r.text.includes('Plants &amp; Gardening Marketplace'), 'home page shows tagline');
  assert(!r.text.includes('/buyer'), 'home page hides role-specific links');

  r = await anon.request('GET', '/login');
  assert(r.status === 200 && r.text.includes('Login'), 'login page renders', `status=${r.status}`);

  r = await anon.request('GET', '/register');
  assert(r.status === 200 && r.text.includes('Create Account'), 'register page renders', `status=${r.status}`);

  r = await anon.request('GET', '/buyer/dashboard');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous buyer dashboard redirects to login', `status=${r.status}`);

  r = await anon.request('GET', '/seller/dashboard');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous seller dashboard redirects to login', `status=${r.status}`);

  r = await anon.request('POST', '/register', {
    fullName: 'Jane Buyer', email: 'jane@example.com', phone: '+254712345678',
    password: 'secret123', confirmPassword: 'secret123', role: 'BUYER'
  });
  assert(r.status === 302 && (r.location || '').includes('/login?registered=1'), 'valid buyer registration redirects to login success', `status=${r.status} loc=${r.location}`);

  r = await anon.request('POST', '/register', {
    fullName: 'Sam Seller', email: 'sam@example.com', phone: '+254712345679',
    password: 'secret123', confirmPassword: 'secret123', role: 'SELLER'
  });
  assert(r.status === 302 && (r.location || '').includes('/login?registered=1'), 'valid seller registration redirects to login success', `status=${r.status}`);

  r = await anon.request('POST', '/register', {
    fullName: 'Another Buyer', email: 'jane@example.com', phone: '+254712345680',
    password: 'secret123', confirmPassword: 'secret123', role: 'BUYER'
  });
  assert(r.status === 400 && r.text.includes('already exists'), 'duplicate email rejected', `status=${r.status}`);

  r = await anon.request('POST', '/register', {
    fullName: 'Short Pass', email: 'short@example.com', phone: '+254712345681',
    password: '123', confirmPassword: '123', role: 'BUYER'
  });
  assert(r.status === 400 && r.text.includes('at least 6 characters'), 'short password rejected', `status=${r.status}`);

  r = await anon.request('POST', '/register', {
    fullName: 'Bad Email', email: 'not-an-email', phone: '+254712345682',
    password: 'secret123', confirmPassword: 'secret123', role: 'BUYER'
  });
  assert(r.status === 400 && r.text.includes('valid email'), 'invalid email rejected', `status=${r.status}`);

  const buyer = makeClient();
  r = await buyer.request('POST', '/login', { email: 'jane@example.com', password: 'secret123' });
  assert(r.status === 302 && r.location === '/buyer/dashboard', 'buyer login redirects to /buyer/dashboard', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('GET', '/buyer/dashboard');
  assert(r.status === 200 && r.text.includes('SANDRONMART Buyer Dashboard'), 'buyer dashboard accessible', `status=${r.status}`);
  assert(r.text.includes('Jane Buyer'), 'buyer dashboard greets user by name');

  r = await buyer.request('GET', '/seller/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from seller dashboard (403)', `status=${r.status}`);

  const seller = makeClient();
  r = await seller.request('POST', '/login', { email: 'sam@example.com', password: 'secret123' });
  assert(r.status === 302 && r.location === '/seller/dashboard', 'seller login redirects to /seller/dashboard', `status=${r.status} loc=${r.location}`);

  r = await seller.request('GET', '/seller/dashboard');
  assert(r.status === 200 && r.text.includes('SANDRONMART Seller Dashboard'), 'seller dashboard accessible', `status=${r.status}`);

  r = await seller.request('GET', '/buyer/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from buyer dashboard (403)', `status=${r.status}`);

  /* ===== Admin Setup & Login ===== */

  r = await anon.request('GET', '/login');
  assert(r.status === 200 && r.text.includes('Admin Login'), 'login page offers an Admin Login option', `status=${r.status}`);

  r = await anon.request('GET', '/login?admin=1');
  assert(r.status === 200 && r.text.includes('Admin Login') && r.text.includes('/admin/setup'), 'admin panel asks for setup before an admin exists', `status=${r.status}`);

  const noDefaultAdmin = appDb.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'").get();
  assert(noDefaultAdmin.c === 0, 'no admin account auto-created with a default password', `count=${noDefaultAdmin.c}`);
  const noHardcodedEmail = appDb.prepare("SELECT COUNT(*) AS c FROM users WHERE email = 'admin@sandronmart.com'").get();
  assert(noHardcodedEmail.c === 0, 'no hardcoded admin email exists in the database', `count=${noHardcodedEmail.c}`);

  r = await anon.request('GET', '/admin/setup');
  assert(r.status === 200 && r.text.includes('Set Up Admin'), 'admin setup page renders', `status=${r.status}`);
  assert(r.text.includes('name="email"') && r.text.includes('name="password"'), 'setup form collects email and password');

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Boss', email: 'boss@sandronmart.com', phone: '+254712345687',
    password: '123', confirmPassword: '123'
  });
  assert(r.status === 400 && r.text.includes('at least 6 characters'), 'short admin password rejected', `status=${r.status}`);

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Boss', email: 'boss@sandronmart.com', phone: '+254712345687',
    password: 'BossPass#2026', confirmPassword: 'notmatching'
  });
  assert(r.status === 400 && r.text.includes('Passwords do not match'), 'mismatched admin passwords rejected', `status=${r.status}`);

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Boss', email: 'not-an-email', phone: '+254712345687',
    password: 'BossPass#2026', confirmPassword: 'BossPass#2026'
  });
  assert(r.status === 400 && r.text.includes('valid email address'), 'invalid admin email rejected', `status=${r.status}`);

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Boss', email: 'jane@example.com', phone: '+254712345687',
    password: 'BossPass#2026', confirmPassword: 'BossPass#2026'
  });
  assert(r.status === 400 && r.text.includes('already exists'), 'admin email must not collide with an existing account', `status=${r.status}`);

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Sandron Boss', email: 'boss@sandronmart.com', phone: '+254712345687',
    password: 'BossPass#2026', confirmPassword: 'BossPass#2026'
  });
  assert(r.status === 302 && (r.location || '').includes('/login?admin=1&setup=1'), 'first admin setup creates the admin and returns to login', `status=${r.status} loc=${r.location}`);

  r = await anon.request('GET', '/login?admin=1&setup=1');
  assert(r.status === 200 && r.text.includes('Admin account created. Please sign in.'), 'setup success message shown on admin login', `status=${r.status}`);
  assert(!r.text.includes('value="admin@sandronmart.com"'), 'no default admin email is prefilled on the login form');

  const adminCount = appDb.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'").get().c;
  assert(adminCount === 1, 'exactly one admin created during setup', `count=${adminCount}`);
  const adminHashRow = appDb.prepare("SELECT password_hash FROM users WHERE email = 'boss@sandronmart.com'").get();
  assert(adminHashRow && adminHashRow.password_hash.startsWith('$2'), 'admin password stored as a bcrypt hash', adminHashRow ? adminHashRow.password_hash : 'missing');
  assert(adminHashRow && adminHashRow.password_hash !== 'BossPass#2026', 'stored admin hash differs from plain text');

  r = await anon.request('POST', '/register', {
    fullName: 'Fake Admin', email: 'fakeadmin@example.com', phone: '+254712345684',
    password: 'secret123', confirmPassword: 'secret123', role: 'ADMIN'
  });
  assert(r.status === 400 && r.text.includes('Buyer or Seller'), 'cannot self-register as an admin', `status=${r.status}`);

  r = await anon.request('GET', '/admin/setup');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'setup page locked once an admin exists', `status=${r.status} loc=${r.location}`);

  r = await anon.request('POST', '/admin/setup', {
    fullName: 'Second Boss', email: 'boss2@sandronmart.com', phone: '+254712345688',
    password: 'BossPass#2026', confirmPassword: 'BossPass#2026'
  });
  assert(r.status === 302 && (r.location || '').includes('/login'), 'duplicate admin setup attempt is rejected', `status=${r.status}`);
  const lockedAdminCount = appDb.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'").get().c;
  assert(lockedAdminCount === 1, 'no duplicate admin created after setup completes', `count=${lockedAdminCount}`);

  const admin = makeClient();
  r = await admin.request('POST', '/login', { email: 'boss@sandronmart.com', password: 'wrongpass' });
  assert(r.status === 302 && (r.location || '').includes('/login?error=1&admin=1'), 'wrong admin password keeps the admin form open', `status=${r.status} loc=${r.location}`);

  r = await admin.request('POST', '/login', { email: 'boss@sandronmart.com', password: 'BossPass#2026' });
  assert(r.status === 302 && r.location === '/admin/dashboard', 'admin login redirects to /admin/dashboard', `status=${r.status} loc=${r.location}`);

  r = await admin.request('GET', '/admin/dashboard');
  assert(r.status === 200 && r.text.includes('SANDRONMART Admin Dashboard'), 'admin dashboard accessible', `status=${r.status}`);
  assert(r.text.includes('Sandron Boss'), 'admin dashboard greets the configured admin by name');
  assert(r.text.includes('Total Products') && r.text.includes('Total Buyers') && r.text.includes('Total Sellers') && r.text.includes('Total Orders'), 'admin dashboard shows all four totals');

  r = await admin.request('GET', '/admin/products');
  assert(r.status === 200 && r.text.includes('All Products'), 'admin products page accessible', `status=${r.status}`);
  assert(!r.text.includes('Add Product'), 'admin products page is read-only (no seller actions)');

  r = await admin.request('GET', '/admin/buyers');
  assert(r.status === 200 && r.text.includes('Buyers'), 'admin buyers page accessible', `status=${r.status}`);

  r = await admin.request('GET', '/admin/sellers');
  assert(r.status === 200 && r.text.includes('Sellers'), 'admin sellers page accessible', `status=${r.status}`);

  r = await admin.request('GET', '/admin/orders');
  assert(r.status === 200 && r.text.includes('All Orders'), 'admin orders page accessible', `status=${r.status}`);

  r = await anon.request('GET', '/admin/dashboard');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous admin dashboard redirects to login', `status=${r.status}`);

  r = await buyer.request('GET', '/admin/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from admin dashboard (403)', `status=${r.status}`);

  r = await seller.request('GET', '/admin/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from admin dashboard (403)', `status=${r.status}`);

  r = await buyer.request('GET', '/admin/products');
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from admin products (403)', `status=${r.status}`);

  r = await admin.request('GET', '/buyer/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'admin blocked from buyer dashboard (403)', `status=${r.status}`);

  r = await admin.request('GET', '/seller/dashboard');
  assert(r.status === 403 && r.text.includes('403'), 'admin blocked from seller dashboard (403)', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/dashboard');
  assert(r.status === 200 && r.text.includes('Jane Buyer'), 'buyer login still works after adding admin', `status=${r.status}`);

  r = await seller.request('GET', '/seller/dashboard');
  assert(r.status === 200 && r.text.includes('Sam Seller'), 'seller login still works after adding admin', `status=${r.status}`);

  /* ===== Seller Product Management ===== */

  r = await anon.request('POST', '/register', {
    fullName: 'Otto Seller', email: 'otto@example.com', phone: '+254712345683',
    password: 'secret123', confirmPassword: 'secret123', role: 'SELLER'
  });
  assert(r.status === 302, 'second seller registered', `status=${r.status}`);

  const sellerB = makeClient();
  r = await sellerB.request('POST', '/login', { email: 'otto@example.com', password: 'secret123' });
  assert(r.status === 302 && r.location === '/seller/dashboard', 'second seller logs in', `status=${r.status}`);

  r = await buyer.request('GET', '/seller/products');
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from /seller/products (403)', `status=${r.status}`);
  r = await buyer.request('GET', '/seller/products/new');
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from add product page (403)', `status=${r.status}`);
  r = await buyer.request('POST', '/seller/products', validProduct({ name: 'Should Not Create' }));
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from creating product (403)', `status=${r.status}`);

  r = await seller.request('GET', '/seller/products');
  assert(r.status === 200 && r.text.includes('My Products'), 'seller products page renders', `status=${r.status}`);
  assert(r.text.includes('No products yet'), 'empty state shown for new seller');

  r = await seller.request('GET', '/seller/products/new');
  assert(r.status === 200 && r.text.includes('Add Product'), 'add product page renders', `status=${r.status}`);

  r = await seller.request('POST', '/seller/products', {
    name: 'Monstera Deliciosa', description: 'A lush indoor plant.', category: 'Indoor Plants',
    price: '24.99', stock: '10', imageUrl: 'https://example.com/monstera.jpg'
  });
  assert(r.status === 302 && (r.location || '').includes('/seller/products?created=1'), 'seller creates product', `status=${r.status} loc=${r.location}`);

  r = await seller.request('POST', '/seller/products', {
    name: 'Tomato Seeds', description: 'Heirloom cherry tomato seeds.', category: 'Seeds',
    price: '3.5', stock: '0', imageUrl: ''
  });
  assert(r.status === 302 && (r.location || '').includes('created=1'), 'seller creates zero-stock product', `status=${r.status}`);

  r = await seller.request('GET', '/seller/products?created=1');
  assert(r.text.includes('Product added successfully.'), 'created success message shown');
  assert(r.text.includes('Monstera Deliciosa') && r.text.includes('Tomato Seeds'), 'list shows only own products');
  assert(r.text.includes('Indoor Plants') && r.text.includes('Seeds'), 'list shows categories');
  assert(r.text.includes('\u20B924.99') && r.text.includes('\u20B93.50'), 'list shows formatted prices');
  assert(r.text.includes('10 in stock') && r.text.includes('0 in stock'), 'list shows stock');
  assert(r.text.includes('/edit') && /js-confirm-delete/.test(r.text), 'list has edit and delete controls');

  const idMonstera = extractProductId(r.text, 'Monstera Deliciosa');
  const idTomato = extractProductId(r.text, 'Tomato Seeds');
  assert(idMonstera !== null && idTomato !== null && idMonstera !== idTomato, 'product ids extracted', `monstera=${idMonstera} tomato=${idTomato}`);

  r = await seller.request('GET', `/seller/products/${idMonstera}/edit`);
  assert(r.status === 200 && r.text.includes('Edit Product') && r.text.includes('Monstera Deliciosa'), 'edit page prefilled for own product', `status=${r.status}`);

  r = await seller.request('POST', `/seller/products/${idMonstera}/update`, {
    name: 'Monstera Albo', description: 'A variegated indoor plant.', category: 'Indoor Plants',
    price: '39.99', stock: '7', imageUrl: 'https://example.com/albo.jpg'
  });
  assert(r.status === 302 && (r.location || '').includes('updated=1'), 'seller updates own product', `status=${r.status} loc=${r.location}`);

  r = await seller.request('GET', '/seller/products?updated=1');
  assert(r.text.includes('Product updated successfully.'), 'updated success message shown');
  assert(r.text.includes('Monstera Albo') && !r.text.includes('Monstera Deliciosa'), 'updated name reflected in list');

  r = await sellerB.request('GET', `/seller/products/${idMonstera}/edit`);
  assert(r.status === 302 && (r.location || '').includes('/seller/products?error=1'), 'other seller cannot open edit page', `status=${r.status} loc=${r.location}`);

  r = await sellerB.request('POST', `/seller/products/${idMonstera}/update`, validProduct({ name: 'HACKED', price: '1.00' }));
  assert(r.status === 302 && (r.location || '').includes('error=1'), 'other seller cannot update product', `status=${r.status} loc=${r.location}`);

  r = await sellerB.request('POST', `/seller/products/${idMonstera}/delete`, {});
  assert(r.status === 302 && (r.location || '').includes('error=1'), 'other seller cannot delete product', `status=${r.status} loc=${r.location}`);

  r = await seller.request('GET', '/seller/products');
  assert(r.text.includes('Monstera Albo'), 'product intact after other seller attempts');

  r = await seller.request('POST', '/seller/products', {
    name: '', description: '', category: 'Nonexistent', price: '0', stock: '-5', imageUrl: ''
  });
  assert(r.status === 400, 'invalid product rejected with 400', `status=${r.status}`);
  assert(r.text.includes('Product name is required'), 'name validation message');
  assert(r.text.includes('Description is required'), 'description validation message');
  assert(r.text.includes('valid category'), 'category validation message');
  assert(r.text.includes('must be greater than 0'), 'price validation message');
  assert(r.text.includes('Stock'), 'stock validation message');

  r = await seller.request('POST', `/seller/products/${idTomato}/delete`, {});
  assert(r.status === 302 && (r.location || '').includes('deleted=1'), 'seller deletes own product', `status=${r.status} loc=${r.location}`);

  r = await seller.request('GET', '/seller/products?deleted=1');
  assert(r.text.includes('Product deleted successfully.'), 'deleted success message shown');
  assert(!r.text.includes('Tomato Seeds'), 'deleted product removed from list');

  r = await buyer.request('POST', `/seller/products/${idMonstera}/update`, validProduct({ name: 'Sneaky Update' }));
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from updating product (403)', `status=${r.status}`);
  r = await buyer.request('POST', `/seller/products/${idMonstera}/delete`, {});
  assert(r.status === 403 && r.text.includes('403'), 'buyer blocked from deleting product (403)', `status=${r.status}`);

  /* ===== Buyer Product Browsing ===== */

  r = await seller.request('POST', '/seller/products', {
    name: 'Rose Bush', description: 'A fragrant climbing rose for sunny gardens.', category: 'Outdoor Plants',
    price: '19.99', stock: '5', imageUrl: 'https://example.com/rose.jpg'
  });
  assert(r.status === 302 && (r.location || '').includes('created=1'), 'seller creates outdoor plant for browsing', `status=${r.status}`);

  r = await seller.request('POST', '/seller/products', {
    name: 'Garden Trowel', description: 'A sturdy hand tool for planting and weeding.', category: 'Gardening Tools',
    price: '8.75', stock: '0', imageUrl: 'https://example.com/trowel.jpg'
  });
  assert(r.status === 302 && (r.location || '').includes('created=1'), 'seller creates gardening tool for browsing', `status=${r.status}`);

  r = await anon.request('GET', '/buyer/products');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous product browsing redirects to login', `status=${r.status}`);
  r = await anon.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous product detail redirects to login', `status=${r.status}`);
  r = await anon.request('GET', '/buyer/account');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous buyer account redirects to login', `status=${r.status}`);
  r = await anon.request('GET', '/buyer/orders');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous buyer orders redirects to login', `status=${r.status}`);

  r = await seller.request('GET', '/buyer/products');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from browsing products (403)', `status=${r.status}`);
  r = await seller.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from product detail (403)', `status=${r.status}`);
  r = await seller.request('GET', '/buyer/account');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from buyer account (403)', `status=${r.status}`);
  r = await seller.request('GET', '/buyer/orders');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from buyer orders (403)', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/products');
  assert(r.status === 200 && r.text.includes('Browse Products'), 'buyer products page renders', `status=${r.status}`);
  assert(r.text.includes('Monstera Albo') && r.text.includes('Rose Bush') && r.text.includes('Garden Trowel'), 'buyer sees all active products');
  assert(!r.text.includes('Tomato Seeds'), 'deleted product hidden from buyer');
  assert(r.text.includes('Out of stock'), 'buyer sees out-of-stock indicator');
  assert(r.text.includes('10 in stock') || r.text.includes('in stock'), 'buyer sees stock availability');
  assert(/\/buyer\/products\/\d+/.test(r.text), 'product cards link to detail pages');
  assert(r.text.includes('href="/buyer/dashboard"') && r.text.includes('href="/buyer/products"') && r.text.includes('href="/buyer/account"') && r.text.includes('href="/buyer/orders"'), 'buyer header shows navigation links');

  r = await seller.request('GET', '/seller/dashboard');
  assert(!r.text.includes('/buyer/products') && !r.text.includes('/buyer/account') && !r.text.includes('/buyer/orders'), 'seller header hides buyer links');

  r = await buyer.request('GET', '/buyer/products?search=rose');
  assert(r.text.includes('Rose Bush') && !r.text.includes('Monstera Albo') && !r.text.includes('Garden Trowel'), 'search matches product name');

  r = await buyer.request('GET', '/buyer/products?search=fragrant');
  assert(r.text.includes('Rose Bush') && !r.text.includes('Garden Trowel'), 'search matches product description');

  r = await buyer.request('GET', '/buyer/products?search=gardening');
  assert(r.text.includes('Garden Trowel') && !r.text.includes('Monstera Albo') && !r.text.includes('Rose Bush'), 'search matches category name');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Gardening Tools'));
  assert(r.text.includes('Garden Trowel') && !r.text.includes('Monstera Albo') && !r.text.includes('Rose Bush'), 'category filter narrows list');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Indoor Plants'));
  assert(r.text.includes('Monstera Albo') && !r.text.includes('Rose Bush'), 'category filter matches indoor plants');

  r = await buyer.request('GET', '/buyer/products?search=rose&category=' + encodeURIComponent('Outdoor Plants'));
  assert(r.text.includes('Rose Bush') && !r.text.includes('Garden Trowel'), 'search and category filter combine');

  r = await buyer.request('GET', '/buyer/products?search=zzznoresults');
  assert(r.text.includes('No products found'), 'search with no matches shows empty state');

  /* ===== Search: generic across ALL categories ===== */

  const extraProducts = [
    ['Tomato Plant', 'Grow juicy tomatoes at home.', 'Herbs & Vegetables', '4.25', '20'],
    ['Money Plant', 'A lucky easy-care indoor vine.', 'Indoor Plants', '6.5', '15'],
    ['Terracotta Pot', 'A sturdy clay pot for patios.', 'Pots & Planters', '12', '8'],
    ['Organic Compost', 'Feed your vegetables naturally.', 'Fertilizers', '9.99', '30'],
    ['Pea Seeds', 'Sweet green peas for your patch.', 'Seeds', '2.5', '40'],
  ];
  for (const [name, description, category, price, stock] of extraProducts) {
    r = await seller.request('POST', '/seller/products', { name, description, category, price, stock });
    assert(r.status === 302 && (r.location || '').includes('created=1'), `seller creates ${name} for search tests`, `status=${r.status}`);
  }

  r = await seller.request('POST', '/seller/products', {
    name: 'Broken Image Fern', description: 'Fails to load; tests client-side image fallback.', category: 'Outdoor Plants',
    price: '11.11', stock: '4', imageUrl: 'https://example.invalid/nope.jpg'
  });
  assert(r.status === 302 && (r.location || '').includes('created=1'), 'seller creates product with unreachable image URL', `status=${r.status}`);

  const perCategory = {
    'Indoor Plants': ['Monstera Albo', 'Money Plant'],
    'Outdoor Plants': ['Rose Bush'],
    'Seeds': ['Pea Seeds'],
    'Pots & Planters': ['Terracotta Pot'],
    'Gardening Tools': ['Garden Trowel'],
    'Fertilizers': ['Organic Compost'],
    'Herbs & Vegetables': ['Tomato Plant'],
  };
  const allNames = Object.values(perCategory).flat();

  for (const [category, present] of Object.entries(perCategory)) {
    r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent(category));
    present.forEach((name) => assert(r.text.includes(name), `category filter shows ${name} in ${category}`));
    allNames.filter((name) => !present.includes(name)).forEach((name) =>
      assert(!r.text.includes(name), `category filter excludes ${name} from ${category}`)
    );
  }

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('Terracotta Pot'));
  assert(r.text.includes('Terracotta Pot') && !r.text.includes('Monstera Albo') && !r.text.includes('Rose Bush') && !r.text.includes('Pea Seeds'), 'search matches full product name');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('terrac'));
  assert(r.text.includes('Terracotta Pot') && !r.text.includes('Monstera Albo'), 'search matches partial product name');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('tom'));
  assert(r.text.includes('Tomato Plant') && !r.text.includes('Garden Trowel') && !r.text.includes('Monstera Albo'), 'search "tom" -> Tomato Plant');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('money'));
  assert(r.text.includes('Money Plant') && !r.text.includes('Rose Bush'), 'search "money" -> Money Plant');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('pot'));
  assert(r.text.includes('Terracotta Pot') && !r.text.includes('Rose Bush') && !r.text.includes('Garden Trowel'), 'search "pot" -> Terracotta Pot');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('juicy'));
  assert(r.text.includes('Tomato Plant') && !r.text.includes('Monstera Albo'), 'search matches description keyword');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('clay'));
  assert(r.text.includes('Terracotta Pot'), 'search matches description "clay"');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('Seeds'));
  assert(r.text.includes('Pea Seeds') && !r.text.includes('Tomato Plant'), 'search term matches category name');

  r = await buyer.request('GET', '/buyer/products?search=' + encodeURIComponent('Fertilizers'));
  assert(r.text.includes('Organic Compost') && !r.text.includes('Rose Bush'), 'search term matches category name (Fertilizers)');

  r = await buyer.request('GET', '/buyer/products?search=ROSE');
  assert(r.text.includes('Rose Bush') && !r.text.includes('Garden Trowel'), 'search is case-insensitive (ROSE)');

  r = await buyer.request('GET', '/buyer/products?search=mOnEy');
  assert(r.text.includes('Money Plant'), 'search is case-insensitive (mOnEy)');

  r = await buyer.request('GET', '/buyer/products?search=%20%20rose%20%20');
  assert(r.text.includes('Rose Bush') && !r.text.includes('Garden Trowel'), 'search trims leading and trailing spaces');

  r = await buyer.request('GET', '/buyer/products?search=%20money%20&category=' + encodeURIComponent('Indoor Plants'));
  assert(r.text.includes('Money Plant') && !r.text.includes('Monstera Albo'), 'trimmed search combines with category filter');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('All Categories'));
  assert(r.status === 200 && allNames.every((name) => r.text.includes(name)), 'All Categories shows products from every category', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/products?category=');
  assert(allNames.every((name) => r.text.includes(name)), 'empty category shows products from every category');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Seeds'));
  assert(r.text.includes('Pea Seeds') && !r.text.includes('Tomato Plant') && !r.text.includes('Rose Bush'), 'empty search with category shows whole category');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Herbs & Vegetables'));
  assert(r.text.includes('Tomato Plant') && !r.text.includes('Pea Seeds'), 'Herbs & Vegetables filter matches');

  r = await buyer.request('GET', '/buyer/products?search=plant&category=' + encodeURIComponent('Indoor Plants'));
  assert(r.text.includes('Monstera Albo') && r.text.includes('Money Plant') && !r.text.includes('Garden Trowel'), 'search and category filter combine across matches');

  r = await buyer.request('GET', '/buyer/products?search=rose&category=' + encodeURIComponent('Seeds'));
  assert(r.text.includes('No products found'), 'search and category with no match shows empty state');

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Fertilizers'));
  assert(r.text.includes('Organic Compost') && !r.text.includes('Garden Trowel'), 'category filter matches fertilizers');

  r = await buyer.request('GET', '/buyer/products?search=rose&category=Junk');
  assert(r.status === 200 && r.text.includes('Rose Bush') && !r.text.includes('Pea Seeds'), 'unknown category is ignored while search still applies', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/products');
  assert(r.text.includes('name="search"') && r.text.includes('name="category"') && r.text.includes('All Categories'), 'search form field names match backend params');

  /* ===== Product image defaults (local, name-based) ===== */
  r = await buyer.request('GET', '/buyer/products');
  assert(r.text.includes('/js/product-image.js'), 'shared product image fallback script loaded on product pages');
  const expectedUploadedSrcs = {
    'Monstera Albo': 'https://example.com/albo.jpg',
    'Rose Bush': 'https://example.com/rose.jpg',
    'Garden Trowel': 'https://example.com/trowel.jpg',
    'Broken Image Fern': 'https://example.invalid/nope.jpg',
  };
  const expectedDefaultFiles = {
    'Monstera Albo': 'monstera.jpg',
    'Rose Bush': 'rose.jpg',
    'Garden Trowel': 'garden-trowel.jpg',
    'Broken Image Fern': 'fern.jpg',
    'Tomato Plant': 'tomato.jpg',
    'Money Plant': 'money-plant.jpg',
    'Terracotta Pot': 'plant-pot.jpg',
    'Organic Compost': 'compost.jpg',
    'Pea Seeds': 'pea-seeds.jpg',
  };
  const cards = r.text.split('class="product-card"').slice(1);
  assert(cards.length >= 9, 'every product on the browse page renders a product card', `cards=${cards.length}`);
  for (const [name, file] of Object.entries(expectedDefaultFiles)) {
    const card = cards.find((c) => c.includes(name));
    assert(card && card.includes('data-default-image="/assets/images/products/' + file + '"'), `card for ${name} wires a product-specific default image (${file})`, card ? 'missing data-default-image' : 'card not found');
  }
  for (const [name, src] of Object.entries(expectedUploadedSrcs)) {
    const card = cards.find((c) => c.includes(name));
    assert(card && card.includes('src="' + src + '"'), `card for ${name} keeps its uploaded image URL`, card ? 'missing uploaded src' : 'card not found');
  }
  for (const name of ['Tomato Plant', 'Money Plant', 'Terracotta Pot', 'Organic Compost', 'Pea Seeds']) {
    const card = cards.find((c) => c.includes(name));
    const file = expectedDefaultFiles[name];
    assert(card && card.includes('src="/assets/images/products/' + file + '"'), `card for ${name} uses its product-specific default directly`, card ? 'missing default src' : 'card not found');
  }
  assert((r.text.match(/data-default-image=/g) || []).length === cards.length, 'every product card image has a fallback wired', `imgs=${(r.text.match(/data-default-image=/g) || []).length} cards=${cards.length}`);

  const productImageFiles = fs.readdirSync(path.join(rootDir, 'public', 'assets', 'images', 'products')).filter((f) => f.endsWith('.jpg'));
  assert(productImageFiles.length === 23, 'expected 23 local product photos', `files=${productImageFiles.length}`);
  for (const file of productImageFiles) {
    r = await anon.request('GET', '/assets/images/products/' + file);
    assert(r.status === 200 && r.text.length > 1000, file + ' served locally as a static asset', 'status=' + r.status);
  }
  r = await anon.request('GET', '/assets/images/products/default.jpg');
  assert(r.status === 200, 'default product image reachable without login', 'status=' + r.status);

  /* ===== Every seeded product gets its own realistic local photo ===== */
  const seededCases = [
    ['Snake Plant', 'Indoor Plants', 'snake-plant.jpg'],
    ['Money Plant', 'Indoor Plants', 'money-plant.jpg'],
    ['Succulent Mix', 'Indoor Plants', 'succulent-mix.jpg'],
    ['Rose Plant', 'Outdoor Plants', 'rose.jpg'],
    ['Lavender Plant', 'Outdoor Plants', 'lavender.jpg'],
    ['Pea Seeds', 'Seeds', 'pea-seeds.jpg'],
    ['Sunflower Seeds', 'Seeds', 'sunflower-seeds.jpg'],
    ['Plant Pot', 'Pots & Planters', 'plant-pot.jpg'],
    ['Hanging Basket', 'Pots & Planters', 'hanging-basket.jpg'],
    ['Garden Trowel', 'Gardening Tools', 'garden-trowel.jpg'],
    ['Watering Can', 'Gardening Tools', 'watering-can.jpg'],
    ['Organic Compost', 'Fertilizers', 'compost.jpg'],
    ['Liquid Fertilizer', 'Fertilizers', 'liquid-fertilizer.jpg'],
    ['Tomato Plant', 'Herbs & Vegetables', 'tomato.jpg'],
    ['Basil Plant', 'Herbs & Vegetables', 'basil.jpg'],
  ];
  const seenImages = new Set();
  for (const [name, category, expected] of seededCases) {
    const img = defaultProductImage({ name, category });
    assert(img === '/assets/images/products/' + expected, `seeded product "${name}" maps to its own photo (${expected})`, img);
    assert(fs.existsSync(path.join(rootDir, 'public', img)), `photo file exists for "${name}"`, img);
    assert(!seenImages.has(img), `seeded products get DISTINCT photos (duplicate ${img})`);
    seenImages.add(img);
  }
  assert(seenImages.size === seededCases.length && !seenImages.has('/assets/images/products/default.jpg'), 'no seeded product reuses the generic default', `distinct=${seenImages.size}`);
  assert(defaultProductImage({ name: 'Custom Pot with stand', category: 'Pots & Planters' }) === '/assets/images/products/plant-pot.jpg', 'category-only fallback still picks a real photo');
  assert(defaultProductImage('Pots & Planters') === '/assets/images/products/plant-pot.jpg', 'plain category string still resolves via category fallback');
  assert(defaultProductImage({ name: 'Mystery Widget', category: 'Mystery' }) === '/assets/images/products/default.jpg', 'fully unknown product uses the generic default');

  r = await buyer.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.status === 200 && r.text.includes('Monstera Albo'), 'buyer opens product detail', `status=${r.status}`);
  assert(r.text.includes('src="https://example.com/albo.jpg"'), 'detail page keeps the uploaded product image');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'detail page wires a product-specific default image fallback');
  assert(r.text.includes('Indoor Plants') && r.text.includes('\u20B939.99'), 'detail shows category and price');
  assert(r.text.includes('7 in stock'), 'detail shows available stock');
  assert(r.text.includes('Sam Seller'), 'detail shows seller information');
  assert(r.text.includes('Add to Cart'), 'detail shows add to cart button');
  assert(r.text.includes('A variegated indoor plant.'), 'detail shows description');

  r = await buyer.request('GET', `/buyer/products/${idTomato}`);
  assert(r.status === 404 && r.text.includes('Not Found'), 'deleted product detail returns 404', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/products/999999');
  assert(r.status === 404 && r.text.includes('Not Found'), 'non-existent product detail returns 404', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/products');
  const idTomatoPlant = extractBuyerProductId(r.text, 'Tomato Plant');
  assert(idTomatoPlant !== null, 'no-image product id extracted', `id=${idTomatoPlant}`);
  r = await buyer.request('GET', `/buyer/products/${idTomatoPlant}`);
  assert(r.status === 200 && r.text.includes('src="/assets/images/products/tomato.jpg"'), 'no-image product detail shows its product-specific default immediately', `status=${r.status}`);
  assert(r.text.includes('data-default-image="/assets/images/products/tomato.jpg"'), 'no-image product detail has fallback wired');

  r = await buyer.request('GET', '/buyer/account');
  assert(r.status === 200 && r.text.includes('My Account'), 'buyer account page renders', `status=${r.status}`);
  assert(r.text.includes('Jane Buyer') && r.text.includes('jane@example.com'), 'account shows name and email');
  assert(r.text.includes('+254712345678'), 'account shows phone');
  assert(r.text.includes('BUYER'), 'account shows role');
  assert(r.text.includes('Member Since'), 'account shows membership date');
  assert(!r.text.includes('secret123') && !r.text.includes('password_hash'), 'account never exposes password');

  r = await buyer.request('GET', '/buyer/orders');
  assert(r.status === 200 && r.text.includes('My Orders'), 'buyer orders page renders', `status=${r.status}`);
  assert(r.text.includes('Your orders will appear here after you place an order.'), 'orders empty state message shown');

  r = await buyer.request('GET', '/buyer/dashboard');
  assert(r.status === 200 && r.text.includes('Discover Plants'), 'buyer dashboard renders', `status=${r.status}`);
  assert(r.text.includes('href="/buyer/products"') && r.text.includes('href="/buyer/account"') && r.text.includes('href="/buyer/orders"'), 'dashboard cards link to buyer pages');
  assert(!r.text.includes('coming soon'), 'no coming-soon placeholders on buyer dashboard');

  /* ===== Buyer Shopping Cart ===== */

  r = await anon.request('GET', '/buyer/cart');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous cart page redirects to login', `status=${r.status}`);
  r = await anon.request('POST', '/buyer/cart/add', { product_id: '1', quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous cart add redirects to login', `status=${r.status}`);
  r = await anon.request('POST', '/buyer/cart/1/update', { action: 'increase' });
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous cart update redirects to login', `status=${r.status}`);
  r = await anon.request('POST', '/buyer/cart/1/remove', {});
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous cart remove redirects to login', `status=${r.status}`);

  r = await seller.request('GET', '/buyer/cart');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from cart page (403)', `status=${r.status}`);
  r = await seller.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '1' });
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from adding to cart (403)', `status=${r.status}`);
  r = await seller.request('POST', '/buyer/cart/1/update', { action: 'increase' });
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from updating cart (403)', `status=${r.status}`);
  r = await seller.request('POST', '/buyer/cart/1/remove', {});
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from removing cart item (403)', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/cart');
  assert(r.status === 200 && r.text.includes('Your Cart'), 'buyer cart page renders', `status=${r.status}`);
  assert(r.text.includes('Your cart is empty.'), 'empty cart message shown');
  assert(r.text.includes('Continue Shopping') && r.text.includes('href="/buyer/products"'), 'empty cart has continue shopping link');

  r = await buyer.request('GET', '/buyer/products');
  const idRose = extractBuyerProductId(r.text, 'Rose Bush');
  const idTrowel = extractBuyerProductId(r.text, 'Garden Trowel');
  assert(idRose !== null && idTrowel !== null && idRose !== idMonstera, 'buyer product ids extracted', `rose=${idRose} trowel=${idTrowel}`);

  r = await buyer.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.text.includes('action="/buyer/cart/add"') && r.text.includes('name="product_id"'), 'detail page has working add to cart form');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '2' });
  assert(r.status === 302 && (r.location || '').includes('/buyer/cart?added=1'), 'buyer adds product to cart', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('GET', '/buyer/cart?added=1');
  assert(r.text.includes('Product added to your cart.'), 'added success message shown');
  assert(r.text.includes('Monstera Albo') && r.text.includes('Indoor Plants'), 'cart lists product with category');
  assert(r.text.includes('src="https://example.com/albo.jpg"'), 'cart keeps the uploaded product image');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'cart item wires a product-specific default image fallback');
  assert(r.text.includes('\u20B939.99') && r.text.includes('2'), 'cart shows unit price and quantity');
  assert(r.text.includes('\u20B979.98'), 'cart shows subtotal');
  assert(r.text.includes('href="/buyer/cart"'), 'cart page has cart nav link');
  assert(/\/buyer\/cart\/\d+\/remove/.test(r.text), 'cart items have remove buttons');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 're-adding product merges cart row', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert((r.text.match(/class="cart-item"/g) || []).length === 1, 'no duplicate cart rows for same product');
  assert(r.text.includes('<span class="qty-value">3</span>'), 'merged quantity is 3');
  assert(r.text.includes('\u20B9119.97'), 'merged subtotal shown');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '5' });
  assert(r.status === 302 && (r.location || '').includes('stock=1'), 'add above stock rejected', `status=${r.status} loc=${r.location}`);
  r = await buyer.request('GET', '/buyer/cart?stock=1');
  assert(r.text.includes('Quantity cannot exceed available stock.'), 'stock limit error message shown');
  assert(r.text.includes('<span class="qty-value">3</span>'), 'cart quantity unchanged after stock rejection');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idTrowel), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('stock=1'), 'out-of-stock product add rejected', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(!r.text.includes('Garden Trowel'), 'out-of-stock product not added to cart');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idRose), quantity: '2' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'buyer adds second product', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/products');
  assert(r.text.includes('Cart (5)'), 'header shows cart item count');

  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('\u20B9159.95'), 'cart total sums all subtotals');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idRose), quantity: '10' });
  assert(r.status === 302 && (r.location || '').includes('stock=1'), 'fresh add exceeding stock rejected', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('\u20B9159.95'), 'cart unchanged after rejected over-stock add');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '0' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'zero quantity rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '-1' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'negative quantity rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: 'abc' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'non-numeric quantity rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', {});
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'missing product id rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: '999999', quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('notfound=1'), 'missing product add rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idTomato), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('notfound=1'), 'deleted product add rejected', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart?notfound=1');
  assert(r.text.includes('That product is no longer available.'), 'product not found message shown');
  assert(r.text.includes('\u20B9159.95'), 'cart intact after failed adds');

  r = await buyer.request('GET', '/buyer/cart');
  const cartIdMonstera = extractCartItemId(r.text, 'Monstera Albo');
  const cartIdRose = extractCartItemId(r.text, 'Rose Bush');
  assert(cartIdMonstera !== null && cartIdRose !== null && cartIdMonstera !== cartIdRose, 'cart item ids extracted', `monstera=${cartIdMonstera} rose=${cartIdRose}`);

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'increase' });
  assert(r.status === 302 && (r.location || '').includes('updated=1'), 'cart quantity increased', `status=${r.status} loc=${r.location}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">4</span>'), 'quantity increased to 4');

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'decrease' });
  assert(r.status === 302 && (r.location || '').includes('updated=1'), 'cart quantity decreased', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">3</span>'), 'quantity decreased back to 3');

  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/update`, { action: 'increase' });
  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/update`, { action: 'increase' });
  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/update`, { action: 'increase' });
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">5</span>'), 'quantity increased to stock limit');

  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/update`, { action: 'increase' });
  assert(r.status === 302 && (r.location || '').includes('stock=1'), 'increase past stock rejected', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart?stock=1');
  assert(r.text.includes('<span class="qty-value">5</span>'), 'quantity stays at stock limit');

  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/update`, { action: 'decrease' });
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">4</span>'), 'quantity decreased from stock limit');

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'decrease' });
  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'decrease' });
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">1</span>'), 'quantity decreased to minimum');

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'decrease' });
  assert(r.status === 302 && (r.location || '').includes('updated=1'), 'decrease below minimum clamped', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('<span class="qty-value">1</span>'), 'quantity stays at minimum');

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'bogus' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'unknown cart action rejected', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/999999/update', { action: 'increase' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'other buyers cart item update rejected', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('\u20B9119.95'), 'cart total correct after updates');

  r = await anon.request('POST', '/register', {
    fullName: 'Bella Buyer', email: 'bella@example.com', phone: '+254712345686',
    password: 'secret123', confirmPassword: 'secret123', role: 'BUYER'
  });
  assert(r.status === 302, 'second buyer registered', `status=${r.status}`);
  const buyerB = makeClient();
  r = await buyerB.request('POST', '/login', { email: 'bella@example.com', password: 'secret123' });
  assert(r.status === 302 && r.location === '/buyer/dashboard', 'second buyer logs in', `status=${r.status}`);

  r = await buyerB.request('GET', '/buyer/cart');
  assert(r.status === 200 && r.text.includes('Your cart is empty.'), 'second buyer sees own empty cart', `status=${r.status}`);

  r = await buyerB.request('POST', `/buyer/cart/${cartIdMonstera}/update`, { action: 'increase' });
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'buyer cannot update other buyers cart item', `status=${r.status} loc=${r.location}`);
  r = await buyerB.request('POST', `/buyer/cart/${cartIdMonstera}/remove`, {});
  assert(r.status === 302 && (r.location || '').includes('invalid=1'), 'buyer cannot remove other buyers cart item', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('Monstera Albo') && r.text.includes('Rose Bush'), 'original cart intact after other buyer attempts');

  r = await buyerB.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'second buyer adds own cart item', `status=${r.status}`);
  r = await buyerB.request('GET', '/buyer/cart');
  const cartIdB = extractCartItemId(r.text, 'Monstera Albo');
  assert(cartIdB !== null && cartIdB !== cartIdMonstera, 'second buyer has separate cart row', `idB=${cartIdB}`);
  r = await buyerB.request('POST', `/buyer/cart/${cartIdB}/remove`, {});
  assert(r.status === 302 && (r.location || '').includes('removed=1'), 'second buyer removes own cart item', `status=${r.status}`);

  r = await seller.request('GET', '/seller/dashboard');
  assert(!r.text.includes('/buyer/cart'), 'seller header hides cart link');

  r = await buyer.request('GET', '/buyer/dashboard');
  assert(r.text.includes('href="/buyer/cart"'), 'buyer dashboard has cart card');

  r = await buyer.request('POST', `/buyer/cart/${cartIdRose}/remove`, {});
  assert(r.status === 302 && (r.location || '').includes('removed=1'), 'buyer removes product from cart', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/cart?removed=1');
  assert(r.text.includes('Product removed from your cart.'), 'removed success message shown');
  assert(!r.text.includes('Rose Bush'), 'removed product gone from cart');

  r = await buyer.request('POST', `/buyer/cart/${cartIdMonstera}/remove`, {});
  assert(r.status === 302 && (r.location || '').includes('removed=1'), 'buyer removes last cart item', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('Your cart is empty.'), 'cart empty after removing all items');

  /* ===== Indian E-commerce: saved delivery addresses ===== */

  r = await anon.request('GET', '/buyer/addresses');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous saved addresses redirects to login', `status=${r.status}`);
  r = await seller.request('GET', '/buyer/addresses');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from saved addresses (403)', `status=${r.status}`);

  r = await buyer.request('GET', '/buyer/addresses');
  assert(r.status === 200 && r.text.includes('Saved Addresses'), 'buyer saved addresses page renders', `status=${r.status}`);

  const validAddress = {
    full_name: 'Jane Buyer',
    phone: '9876543210',
    house_number: '12/4',
    street: 'Gandhi Street',
    landmark: 'Near Bus Stand',
    city: 'Kanchipuram',
    district: 'Kanchipuram',
    state: 'Tamil Nadu',
    pincode: '631501',
  };

  r = await buyer.request('POST', '/buyer/addresses', validAddress);
  assert(r.status === 302 && (r.location || '').includes('/buyer/addresses?saved=1'), 'buyer saves Indian delivery address', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('POST', '/buyer/addresses', Object.assign({}, validAddress, { phone: '12345', pincode: '123' }));
  assert(r.status === 400, 'invalid address (phone/pincode) rejected', `status=${r.status}`);
  assert(r.text.includes('valid 10-digit Indian mobile') || r.text.includes('valid 6-digit'), 'invalid phone/pincode message shown');

  r = await buyer.request('GET', '/buyer/addresses?saved=1');
  assert(r.text.includes('Address saved successfully.'), 'address saved success message');
  assert(r.text.includes('Gandhi Street') && r.text.includes('631501') && r.text.includes('Default'), 'saved address shown with Indian fields');
  const savedAddressId = extractSavedAddressId(r.text);
  assert(savedAddressId !== null, 'saved address id extracted', `id=${savedAddressId}`);

  /* ===== Indian E-commerce: checkout ===== */

  r = await buyer.request('GET', '/buyer/checkout');
  assert(r.status === 302 && (r.location || '').includes('/buyer/cart'), 'checkout with empty cart redirects to cart', `status=${r.status}`);

  r = await anon.request('GET', '/buyer/checkout');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'anonymous checkout redirects to login', `status=${r.status}`);
  r = await seller.request('GET', '/buyer/checkout');
  assert(r.status === 403 && r.text.includes('403'), 'seller blocked from checkout (403)', `status=${r.status}`);

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '2' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'buyer adds item for checkout', `status=${r.status}`);

  checkoutWindow = computeDeliveryWindow(new Date());
  r = await buyer.request('GET', '/buyer/checkout');
  assert(r.status === 200 && r.text.includes('Checkout'), 'checkout page renders', `status=${r.status}`);
  assert(r.text.includes(formatDateRange(checkoutWindow.start, checkoutWindow.end)), 'checkout delivery range derived from current date', formatDateRange(checkoutWindow.start, checkoutWindow.end));
  assert(r.text.includes(formatDayMonth(checkoutWindow.start)) && r.text.includes(formatDayMonth(checkoutWindow.end)), 'checkout range shows 3-day start and 7-day end', `${formatDayMonth(checkoutWindow.start)} - ${formatDayMonth(checkoutWindow.end)}`);
  assert(r.text.includes('3&ndash;7 day delivery window'), 'checkout shows 3-7 day delivery window label');
  assert(r.text.includes('12/4') && r.text.includes('Gandhi Street') && r.text.includes('Tamil Nadu') && r.text.includes('631501'), 'checkout auto-loads saved delivery address');
  assert(r.text.includes('9:00 AM - 12:00 PM') && r.text.includes('6:00 PM - 9:00 PM'), 'checkout shows delivery time slots');
  assert(r.text.includes('Cash on Delivery') && r.text.includes('UPI') && r.text.includes('Credit / Debit Card'), 'checkout shows Indian-friendly payment methods');
  assert(r.text.includes('Monstera Albo') && r.text.includes('\u20B939.99') && r.text.includes('\u20B979.98'), 'checkout shows items priced in INR');
  assert(r.text.includes('Grand Total') && r.text.includes('\u20B9119.98'), 'checkout shows grand total with delivery charge');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'checkout summary wires a product-specific default image fallback');
  assert(r.text.includes('/js/product-image.js'), 'checkout loads shared image fallback script');
  assert(r.text.includes('Place Order'), 'checkout shows place order button');
  assert(/Expected Delivery/.test(r.text), 'checkout shows expected delivery window');

  /* --- Checkout server-side validation --- */
  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: 'new',
    full_name: 'Jane', phone: '9876543210', house_number: '12/4', street: 'Gandhi Street',
    landmark: '', city: 'Kanchipuram', district: '', state: 'Tamil Nadu', pincode: '631501',
    delivery_time_slot: '',
    payment_method: 'COD',
  });
  assert(r.status === 400 && r.text.includes('delivery time slot'), 'missing time slot rejected', `status=${r.status}`);

  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: 'new',
    full_name: 'Jane', phone: '9876543210', house_number: '12/4', street: 'Gandhi Street',
    landmark: '', city: 'Kanchipuram', district: '', state: 'Tamil Nadu', pincode: '631501',
    delivery_time_slot: '3:00 PM - 6:00 PM',
    payment_method: '',
  });
  assert(r.status === 400 && r.text.includes('payment method'), 'missing payment method rejected', `status=${r.status}`);

  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: 'new',
    full_name: 'Jane', phone: '98765', house_number: '12/4', street: 'Gandhi Street',
    landmark: '', city: 'Kanchipuram', district: '', state: 'Tamil Nadu', pincode: '631501',
    delivery_time_slot: '3:00 PM - 6:00 PM',
    payment_method: 'COD',
  });
  assert(r.status === 400 && r.text.includes('valid 10-digit Indian mobile'), 'invalid Indian phone rejected at checkout', `status=${r.status}`);

  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: 'new',
    full_name: 'Jane', phone: '9876543210', house_number: '12/4', street: 'Gandhi Street',
    landmark: '', city: 'Kanchipuram', district: '', state: 'Tamil Nadu', pincode: '123',
    delivery_time_slot: '3:00 PM - 6:00 PM',
    payment_method: 'COD',
  });
  assert(r.status === 400 && r.text.includes('valid 6-digit Indian pincode'), 'invalid pincode rejected at checkout', `status=${r.status}`);

  /* --- Place order (COD) --- */
  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: String(savedAddressId),
    delivery_time_slot: '3:00 PM - 6:00 PM',
    payment_method: 'COD',
  });
  assert(r.status === 302 && /\/buyer\/orders\/\d+\/confirmation/.test(r.location || ''), 'buyer places order successfully', `status=${r.status} loc=${r.location}`);
  const orderId = extractOrderId(r.location);
  assert(orderId !== null, 'order id extracted', `id=${orderId}`);

  r = await buyer.request('GET', `/buyer/orders/${orderId}/confirmation`);
  assert(r.status === 200 && r.text.includes('Order Placed Successfully!'), 'order confirmation page renders', `status=${r.status}`);
  assert(/SM\d{12}/.test(r.text), 'confirmation shows realistic order id');
  assert(r.text.includes('3:00 PM - 6:00 PM'), 'confirmation shows delivery time slot');
  assert(r.text.includes('Cash on Delivery'), 'confirmation shows payment method');
  assert(r.text.includes('\u20B9119.98'), 'confirmation shows grand total in INR');
  assert(!r.text.includes('$'), 'no dollar amounts anywhere');
  assert(r.text.includes('Track Order') && r.text.includes('Continue Shopping'), 'confirmation shows track and continue buttons');
  assert(r.text.includes(formatDateRange(checkoutWindow.start, checkoutWindow.end)), 'confirmation shows the delivery window captured at order time', formatDateRange(checkoutWindow.start, checkoutWindow.end));

  r = await buyer.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.text.includes('5 in stock'), 'stock reduced on product detail after order');

  /* --- My Orders --- */
  r = await buyer.request('GET', '/buyer/orders');
  assert(r.status === 200 && r.text.includes('My Orders'), 'my orders page renders after placing order', `status=${r.status}`);
  assert(r.text.includes('Monstera Albo') && /SM\d{12}/.test(r.text), 'my orders shows placed order and order id');
  assert(r.text.includes('3:00 PM - 6:00 PM') && r.text.includes('Cash on Delivery'), 'my orders shows delivery time and payment');
  assert(r.text.includes('View Details') && r.text.includes('Track Order'), 'my orders has view details + track buttons');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'my orders uses product-specific default fallback for order items');
  assert(r.text.includes('src="https://example.com/albo.jpg"'), 'my orders keeps the snapshot of the uploaded product image');
  assert(r.text.includes(formatDateRange(checkoutWindow.start, checkoutWindow.end)), 'my orders preserves the original delivery window', formatDateRange(checkoutWindow.start, checkoutWindow.end));

  /* --- Order Details --- */
  r = await buyer.request('GET', `/buyer/orders/${orderId}`);
  assert(r.status === 200 && r.text.includes('Order Details'), 'order details page renders', `status=${r.status}`);
  assert(r.text.includes('12/4') && r.text.includes('Gandhi Street') && r.text.includes('631501'), 'order details shows delivery address');
  assert(r.text.includes('3:00 PM - 6:00 PM') && r.text.includes('Cash on Delivery'), 'order details shows time slot and payment');
  assert(r.text.includes('\u20B940.00') && r.text.includes('\u20B9119.98'), 'order details shows delivery charge and grand total');
  assert(r.text.includes('Track Order'), 'order details has track order button');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'order details uses product-specific default fallback for order items');
  assert(r.text.includes(formatDateRange(checkoutWindow.start, checkoutWindow.end)), 'order details preserves the original delivery window', formatDateRange(checkoutWindow.start, checkoutWindow.end));

  /* --- Order Tracking --- */
  r = await buyer.request('GET', `/buyer/orders/${orderId}/track`);
  assert(r.status === 200 && r.text.includes('Track Order'), 'order tracking page renders', `status=${r.status}`);
  assert(r.text.includes('Order Placed'), 'tracking shows placed step');
  assert(r.text.includes('Order Confirmed') && r.text.includes('Expected:'), 'tracking shows upcoming statuses with expected dates');
  assert(/Expected: \d+ \w+/.test(r.text), 'tracking shows expected delivery dates');
  assert(r.text.includes(formatDateRange(checkoutWindow.start, checkoutWindow.end)), 'tracking preserves the original delivery window', formatDateRange(checkoutWindow.start, checkoutWindow.end));

  /* --- Seller Order Management --- */
  r = await seller.request('GET', '/seller/orders');
  assert(r.status === 200 && r.text.includes('Incoming Orders'), 'seller orders page renders', `status=${r.status}`);
  assert(r.text.includes('Monstera Albo') && /SM\d{12}/.test(r.text), 'seller sees incoming order with own product');
  assert(r.text.includes('Jane Buyer') && r.text.includes('9876543210'), 'seller sees buyer name and phone');
  assert(r.text.includes('Gandhi Street') && r.text.includes('631501'), 'seller sees delivery address');
  assert(r.text.includes('3:00 PM - 6:00 PM') && r.text.includes('Cash on Delivery'), 'seller sees time slot and payment method');
  assert(r.text.includes('\u20B9119.98'), 'seller sees order amount in INR');
  assert(r.text.includes('data-default-image="/assets/images/products/monstera.jpg"'), 'seller order list uses product-specific default fallback for order items');

  r = await sellerB.request('GET', '/seller/orders');
  assert(r.status === 200 && !r.text.includes('Monstera Albo'), 'other seller cannot see unrelated order', `status=${r.status}`);

  r = await seller.request('POST', `/seller/orders/${orderId}/status`, { status: 'SHIPPED' });
  assert(r.status === 302 && (r.location || '').includes('error=1'), 'skipping a status step rejected', `status=${r.status} loc=${r.location}`);

  const statusChain = ['CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  for (const next of statusChain) {
    r = await seller.request('POST', `/seller/orders/${orderId}/status`, { status: next });
    assert(r.status === 302 && (r.location || '').includes('updated=1'), `seller moves order to ${next}`, `status=${r.status} loc=${r.location}`);
  }

  r = await seller.request('POST', `/seller/orders/${orderId}/status`, { status: 'CONFIRMED' });
  assert(r.status === 302 && (r.location || '').includes('error=1'), 'delivered order cannot be changed', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('GET', `/buyer/orders/${orderId}/track`);
  assert(r.status === 200 && r.text.includes('Delivered'), 'buyer tracking reflects delivered status', `status=${r.status}`);
  assert(r.text.includes('✓'), 'tracking shows completed steps');

  r = await buyer.request('GET', '/buyer/orders');
  assert(r.text.includes('status-delivered'), 'my orders badge reflects delivered status');

  /* --- Buyer isolation --- */
  r = await buyerB.request('GET', `/buyer/orders/${orderId}`);
  assert(r.status === 404, 'buyer cannot view another buyers order details', `status=${r.status}`);
  r = await buyerB.request('GET', `/buyer/orders/${orderId}/track`);
  assert(r.status === 404, 'buyer cannot track another buyers order', `status=${r.status}`);
  r = await buyerB.request('GET', `/buyer/orders/${orderId}/confirmation`);
  assert(r.status === 404, 'buyer cannot view another buyers confirmation', `status=${r.status}`);
  r = await seller.request('GET', `/buyer/orders/${orderId}`);
  assert(r.status === 403, 'seller blocked from buyer order details (403)', `status=${r.status}`);

  /* --- Place an order via UPI, then place and cancel one via CARD --- */
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '2' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'buyer adds monstera for UPI order', `status=${r.status}`);
  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idRose), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'buyer adds rose for UPI order', `status=${r.status}`);

  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: String(savedAddressId),
    delivery_time_slot: '9:00 AM - 12:00 PM',
    payment_method: 'UPI',
  });
  assert(r.status === 302 && /\/confirmation/.test(r.location || ''), 'places order with UPI payment', `status=${r.status} loc=${r.location}`);
  const orderIdUpI = extractOrderId(r.location);
  assert(orderIdUpI !== null, 'second order id extracted', `id=${orderIdUpI}`);
  r = await buyer.request('GET', `/buyer/orders/${orderIdUpI}/confirmation`);
  assert(r.text.includes('UPI'), 'confirmation shows UPI payment method');

  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('Your cart is empty.'), 'cart cleared after payment simulation');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idRose), quantity: '1' });
  r = await buyer.request('POST', '/buyer/checkout', {
    address_id: String(savedAddressId),
    delivery_time_slot: '6:00 PM - 9:00 PM',
    payment_method: 'CARD',
  });
  const orderIdCard = extractOrderId(r.location);
  assert(orderIdCard !== null, 'third order id extracted', `id=${orderIdCard}`);
  r = await buyer.request('GET', `/buyer/orders/${orderIdCard}/confirmation`);
  assert(r.text.includes('Credit / Debit Card'), 'confirmation shows card payment method');

  r = await seller.request('POST', `/seller/orders/${orderIdCard}/status`, { status: 'CANCELLED' });
  assert(r.status === 302 && (r.location || '').includes('updated=1'), 'seller cancels order', `status=${r.status} loc=${r.location}`);
  r = await buyer.request('GET', `/buyer/orders/${orderIdCard}/track`);
  assert(r.text.includes('Cancelled'), 'buyer sees cancelled order status');
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('Your cart is empty.'), 'cart stays clear after cancelled order');

  /* --- New-address checkout: buyer with no saved address places an order --- */
  r = await buyerB.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 'second buyer adds item for new-address checkout', `status=${r.status}`);

  r = await buyerB.request('GET', '/buyer/checkout');
  assert(r.status === 200 && r.text.includes('Full Name') && r.text.includes('Pincode'), 'new-address checkout shows address form', `status=${r.status}`);

  r = await buyerB.request('POST', '/buyer/checkout', {
    address_id: 'new',
    full_name: 'Ravi Kumar',
    phone: '9456781230',
    house_number: '45',
    street: 'MG Road',
    landmark: '',
    city: 'Chennai',
    district: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    delivery_time_slot: '9:00 AM - 12:00 PM',
    payment_method: 'COD',
    save_address: '1',
  });
  assert(r.status === 302 && /\/buyer\/orders\/\d+\/confirmation/.test(r.location || ''), 'new-address checkout places order successfully', `status=${r.status} loc=${r.location}`);
  const orderIdNew = extractOrderId(r.location);
  assert(orderIdNew !== null, 'new-address order id extracted', `id=${orderIdNew}`);

  r = await buyerB.request('GET', `/buyer/orders/${orderIdNew}/confirmation`);
  assert(r.status === 200 && r.text.includes('Ravi Kumar') && r.text.includes('600001'), 'new-address confirmation shows entered address', `status=${r.status}`);

  r = await buyerB.request('GET', '/buyer/cart');
  assert(r.text.includes('Your cart is empty.'), 'cart cleared after new-address order');

  const badLogin = makeClient();
  r = await badLogin.request('POST', '/login', { email: 'jane@example.com', password: 'wrong' });
  assert(r.status === 302 && (r.location || '').includes('/login?error=1'), 'invalid credentials show error redirect', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('POST', '/logout', {});
  assert(r.status === 302 && (r.location || '').includes('/login?logout=1'), 'logout redirects to login logout message', `status=${r.status} loc=${r.location}`);

  r = await buyer.request('GET', '/buyer/dashboard');
  assert(r.status === 302 && (r.location || '').includes('/login'), 'dashboard protected after logout', `status=${r.status}`);

  const { default: Database } = await import('better-sqlite3');
  const db = new Database(testDb);
  const stored = db.prepare("SELECT password_hash FROM users WHERE email = 'jane@example.com'").get();
  assert(stored && stored.password_hash.startsWith('$2'), 'password stored as bcrypt hash, not plain text', stored ? stored.password_hash : 'missing');
  assert(stored && stored.password_hash !== 'secret123', 'stored hash differs from plain text');

  const samId = db.prepare("SELECT id FROM users WHERE email = 'sam@example.com'").get().id;
  const ownProducts = db.prepare('SELECT COUNT(*) AS c FROM products WHERE seller_id = ?').get(samId);
  const allProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get();
  assert(ownProducts.c === 9 && allProducts.c === 9, 'products scoped to owner seller in DB', `own=${ownProducts.c} all=${allProducts.c}`);
  const deletedRow = db.prepare('SELECT COUNT(*) AS c FROM products WHERE id = ?').get(idTomato);
  assert(deletedRow.c === 0, 'deleted product removed from DB', `count=${deletedRow.c}`);
  const orphanProducts = db.prepare(
    'SELECT COUNT(*) AS c FROM products p LEFT JOIN users u ON u.id = p.seller_id WHERE u.id IS NULL'
  ).get();
  assert(orphanProducts.c === 0, 'all products reference a valid seller');
  const editedRow = db.prepare("SELECT name FROM products WHERE id = ?").get(idMonstera);
  assert(editedRow && editedRow.name === 'Monstera Albo', 'edited product name persisted in DB', editedRow && editedRow.name);

  const janeId = db.prepare("SELECT id FROM users WHERE email = 'jane@example.com'").get().id;
  const janeCart = db.prepare('SELECT COUNT(*) AS c FROM cart_items WHERE buyer_id = ?').get(janeId);
  const allCart = db.prepare('SELECT COUNT(*) AS c FROM cart_items').get();
  assert(janeCart.c === 0 && allCart.c === 0, 'no cart rows remain after removals', `jane=${janeCart.c} all=${allCart.c}`);
  const orphanCart = db.prepare(
    'SELECT COUNT(*) AS c FROM cart_items ci LEFT JOIN users u ON u.id = ci.buyer_id LEFT JOIN products p ON p.id = ci.product_id WHERE u.id IS NULL OR p.id IS NULL'
  ).get();
  assert(orphanCart.c === 0, 'all cart items reference existing users and products');

  const ordersCount = db.prepare('SELECT COUNT(*) AS c FROM orders').get();
  assert(ordersCount.c === 4, 'four orders stored', `count=${ordersCount.c}`);
  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  assert(orderRow, 'placed order row exists');
  assert(orderRow.order_number.startsWith('SM'), 'order number uses SM prefix', orderRow.order_number);
  assert(orderRow.buyer_id === janeId, 'order tied to buyer');
  assert(orderRow.payment_method === 'COD' && orderRow.status === 'DELIVERED', 'order1 payment/status persisted', `${orderRow.payment_method}/${orderRow.status}`);
  assert(orderRow.total === 119.98 && orderRow.delivery_charge === 40, 'order totals stored correctly', `total=${orderRow.total} charge=${orderRow.delivery_charge}`);
  assert(orderRow.full_name === 'Jane Buyer' && orderRow.phone === '9876543210' && orderRow.pincode === '631501', 'order delivery address stored');
  assert(orderRow.delivery_time_slot === '3:00 PM - 6:00 PM', 'order time slot stored', orderRow.delivery_time_slot);
  assert(checkoutWindow && orderRow.delivery_start_date === checkoutWindow.start && orderRow.delivery_end_date === checkoutWindow.end, 'order snapshots the delivery window shown at checkout', `${orderRow.delivery_start_date}/${orderRow.delivery_end_date} vs ${checkoutWindow && checkoutWindow.start}/${checkoutWindow && checkoutWindow.end}`);
  assert(orderRow.delivery_start_date && orderRow.delivery_end_date && orderRow.delivery_end_date >= orderRow.delivery_start_date, 'delivery window stored', `${orderRow.delivery_start_date}-${orderRow.delivery_end_date}`);

  const orderItemRow = db.prepare('SELECT * FROM order_items WHERE order_id = ?').get(orderId);
  assert(orderItemRow && orderItemRow.quantity === 2 && Number(orderItemRow.price) === 39.99 && orderItemRow.seller_id === samId, 'order item quantity/price/seller stored');

  const monstStock = db.prepare('SELECT stock FROM products WHERE id = ?').get(idMonstera);
  assert(monstStock.stock === 2, 'stock reduced after orders', `stock=${monstStock.stock}`);
  const roseStock = db.prepare('SELECT stock FROM products WHERE id = ?').get(idRose);
  assert(roseStock.stock === 3, 'rose stock reduced after orders', `stock=${roseStock.stock}`);

  const statusEvents = db.prepare('SELECT COUNT(*) AS c FROM order_status_events WHERE order_id = ?').get(orderId);
  assert(statusEvents.c === 6, 'status history recorded for each step', `count=${statusEvents.c}`);
  const cancelledRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderIdCard);
  assert(cancelledRow && cancelledRow.status === 'CANCELLED', 'cancelled order persisted', cancelledRow && cancelledRow.status);
  const upiRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderIdUpI);
  assert(upiRow && upiRow.payment_method === 'UPI', 'UPI payment method persisted', upiRow && upiRow.payment_method);
  const bellaId = db.prepare("SELECT id FROM users WHERE email = 'bella@example.com'").get().id;
  const newOrderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderIdNew);
  assert(newOrderRow && newOrderRow.buyer_id === bellaId && newOrderRow.payment_method === 'COD' && Number(newOrderRow.total) === 79.99, 'new-address order stored for second buyer', newOrderRow && `${newOrderRow.buyer_id}/${newOrderRow.payment_method}/${newOrderRow.total}`);
  assert(newOrderRow && newOrderRow.city === 'Chennai' && newOrderRow.pincode === '600001', 'new-address order stores entered delivery address', newOrderRow && `${newOrderRow.city}/${newOrderRow.pincode}`);
  const bellaAddress = db.prepare('SELECT * FROM addresses WHERE buyer_id = ?').get(bellaId);
  assert(bellaAddress && bellaAddress.pincode === '600001' && bellaAddress.is_default === 1, 'save_address persists new address for second buyer', bellaAddress && bellaAddress.pincode);

  const orphanOrders = db.prepare(
    'SELECT COUNT(*) AS c FROM orders o LEFT JOIN users u ON u.id = o.buyer_id WHERE u.id IS NULL'
  ).get();
  assert(orphanOrders.c === 0, 'all orders reference a valid buyer');
  const orphanOrderItems = db.prepare(
    'SELECT COUNT(*) AS c FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL'
  ).get();
  assert(orphanOrderItems.c === 0, 'all order items reference a valid order');

  /* ===== Admin data views reflect the database ===== */
  const dbTotals = {
    products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
    buyers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'BUYER'").get().c,
    sellers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'SELLER'").get().c,
    orders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
  };
  r = await admin.request('GET', '/admin/dashboard');
  for (const key of ['products', 'buyers', 'sellers', 'orders']) {
    const m = r.text.match(new RegExp('id="admin-stat-' + key + '">(\\d+)<'));
    assert(m && Number(m[1]) === dbTotals[key], 'admin dashboard shows correct ' + key + ' total', m ? `shown=${m[1]} db=${dbTotals[key]}` : 'stat not found');
  }
  const recentOrderNumber = db.prepare('SELECT order_number FROM orders ORDER BY id DESC LIMIT 1').get().order_number;
  assert(r.text.includes(recentOrderNumber), 'admin dashboard recent orders lists latest order', recentOrderNumber);

  const orderNumbers = db.prepare('SELECT order_number FROM orders ORDER BY id').all().map((o) => o.order_number);
  r = await admin.request('GET', '/admin/orders');
  for (const number of orderNumbers) {
    assert(r.text.includes(number), 'admin orders page lists every order', number);
  }

  r = await admin.request('GET', '/admin/products');
  assert(r.text.includes('Monstera Albo') && r.text.includes('Tomato Plant'), 'admin products page lists products from all sellers');

  r = await admin.request('GET', '/admin/buyers');
  assert(r.text.includes('Buyers') && r.text.includes('Jane Buyer') && r.text.includes('jane@example.com'), 'admin buyers page lists buyer accounts');

  r = await admin.request('GET', '/admin/sellers');
  assert(r.text.includes('Sellers') && r.text.includes('Sam Seller') && r.text.includes('Otto Seller'), 'admin sellers page lists seller accounts');

  db.close();
  require('../config/db').close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(testDb + suffix); } catch (e) { /* ignore */ }
  }

  const { execFileSync } = require('child_process');
  const seededDb = path.join(os.tmpdir(), `sandronmart-seed-${Date.now()}.db`);
  const seedEnv = Object.assign({}, process.env, { DB_PATH: seededDb });
  delete seedEnv.NODE_ENV;
  const probe = `
    const db = require(${JSON.stringify(path.join(process.cwd(), 'config', 'db.js'))});
    const products = db.prepare('SELECT id, name, category FROM products ORDER BY id').all();
    const sellers = db.prepare('SELECT id, role FROM users WHERE role = ?').all('SELLER');
    const admins = db.prepare("SELECT id, role FROM users WHERE email = ?").all('admin@sandronmart.com');
    const adminCountAfter = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'").get().c;
    console.log(JSON.stringify({ products, sellers, admins, adminCountAfter }));
    db.close();
  `;
  let seeded;
  try {
    seeded = JSON.parse(execFileSync(process.execPath, ['-e', probe], { env: seedEnv, encoding: 'utf8' }));
  } catch (e) {
    seeded = { products: [], sellers: [], admins: [], error: String(e) };
  }
  assert(seeded.products.length > 0, 'fresh database is seeded with products on init', seeded.error || ('count=' + seeded.products.length));
  assert(seeded.products.some((p) => p.name === 'Money Plant' && p.category === 'Indoor Plants'), 'seeded catalog covers multiple categories');
  assert(seeded.products.some((p) => p.category === 'Pots & Planters') && seeded.products.some((p) => p.category === 'Fertilizers'), 'seeded catalog spans all category groups');
  assert(seeded.products.some((p) => p.category === 'Seeds') && seeded.products.some((p) => p.category === 'Herbs & Vegetables') && seeded.products.some((p) => p.category === 'Gardening Tools'), 'seeded catalog covers remaining categories');
  assert(seeded.sellers.length > 0, 'seed creates a demo seller account', 'count=' + seeded.sellers.length);
  assert(seeded.admins.length === 0 && seeded.adminCountAfter === 0, 'fresh database never auto-creates a default admin account', seeded.admins.length + '/' + seeded.adminCountAfter);
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(seededDb + suffix); } catch (e) { /* ignore */ }
  }

  await new Promise((resolve) => server.close(resolve));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  try { server && server.close(); } catch (e) { /* ignore */ }
  process.exit(1);
});