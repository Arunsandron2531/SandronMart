const fs = require('fs');
const os = require('os');
const path = require('path');

const testDb = path.join(os.tmpdir(), `sandronmart-smoke-${Date.now()}.db`);
process.env.DB_PATH = testDb;
process.env.SESSION_SECRET = 'smoke-test-secret';

const app = require('../app');

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

async function run() {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.log(`Smoke tests against ${baseUrl}\n`);

  const anon = makeClient();

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
  db.close();
  require('../config/db').close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(testDb + suffix); } catch (e) { /* ignore */ }
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