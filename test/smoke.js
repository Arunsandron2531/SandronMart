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
  assert(r.text.includes('$24.99') && r.text.includes('$3.50'), 'list shows formatted prices');
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

  r = await buyer.request('GET', '/buyer/products?category=' + encodeURIComponent('Fertilizers'));
  assert(r.text.includes('No products found'), 'category with no products shows empty state');

  r = await buyer.request('GET', '/buyer/products?category=Junk');
  assert(r.status === 200 && r.text.includes('Monstera Albo'), 'unknown category falls back to all products', `status=${r.status}`);

  r = await buyer.request('GET', `/buyer/products/${idMonstera}`);
  assert(r.status === 200 && r.text.includes('Monstera Albo'), 'buyer opens product detail', `status=${r.status}`);
  assert(r.text.includes('Indoor Plants') && r.text.includes('$39.99'), 'detail shows category and price');
  assert(r.text.includes('7 in stock'), 'detail shows available stock');
  assert(r.text.includes('Sam Seller'), 'detail shows seller information');
  assert(r.text.includes('Add to Cart'), 'detail shows add to cart button');
  assert(r.text.includes('A variegated indoor plant.'), 'detail shows description');

  r = await buyer.request('GET', `/buyer/products/${idTomato}`);
  assert(r.status === 404 && r.text.includes('Not Found'), 'deleted product detail returns 404', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/products/999999');
  assert(r.status === 404 && r.text.includes('Not Found'), 'non-existent product detail returns 404', `status=${r.status}`);

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
  assert(r.text.includes('$39.99') && r.text.includes('2'), 'cart shows unit price and quantity');
  assert(r.text.includes('$79.98'), 'cart shows subtotal');
  assert(r.text.includes('href="/buyer/cart"'), 'cart page has cart nav link');
  assert(/\/buyer\/cart\/\d+\/remove/.test(r.text), 'cart items have remove buttons');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idMonstera), quantity: '1' });
  assert(r.status === 302 && (r.location || '').includes('added=1'), 're-adding product merges cart row', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert((r.text.match(/class="cart-item"/g) || []).length === 1, 'no duplicate cart rows for same product');
  assert(r.text.includes('<span class="qty-value">3</span>'), 'merged quantity is 3');
  assert(r.text.includes('$119.97'), 'merged subtotal shown');

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
  assert(r.text.includes('$159.95'), 'cart total sums all subtotals');

  r = await buyer.request('POST', '/buyer/cart/add', { product_id: String(idRose), quantity: '10' });
  assert(r.status === 302 && (r.location || '').includes('stock=1'), 'fresh add exceeding stock rejected', `status=${r.status}`);
  r = await buyer.request('GET', '/buyer/cart');
  assert(r.text.includes('$159.95'), 'cart unchanged after rejected over-stock add');

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
  assert(r.text.includes('$159.95'), 'cart intact after failed adds');

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
  assert(r.text.includes('$119.95'), 'cart total correct after updates');

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
  assert(ownProducts.c === 3 && allProducts.c === 3, 'products scoped to owner seller in DB', `own=${ownProducts.c} all=${allProducts.c}`);
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