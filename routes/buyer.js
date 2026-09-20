const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');
const { PRODUCT_CATEGORIES } = require('../utils/validators');

const router = express.Router();

router.use('/buyer', requireRole('BUYER'));

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function singleParam(value) {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function escapeLike(term) {
  return term.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function listActiveProducts({ search, category }) {
  const where = [];
  const params = [];

  if (category && PRODUCT_CATEGORIES.includes(category)) {
    where.push('category = ?');
    params.push(category);
  }

  if (search) {
    where.push(
      `(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')`
    );
    const like = `%${escapeLike(search)}%`;
    params.push(like, like, like);
  }

  const sql = `SELECT * FROM products
     ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY created_at DESC, id DESC`;

  return db.prepare(sql).all(...params);
}

router.get('/buyer/products', (req, res) => {
  const search = singleParam(req.query.search).trim().slice(0, 100);
  const category = singleParam(req.query.category).trim();

  const products = listActiveProducts({ search, category });

  res.render('buyer/products/index', {
    title: 'Browse Products',
    products,
    categories: PRODUCT_CATEGORIES,
    search,
    selectedCategory: PRODUCT_CATEGORIES.includes(category) ? category : '',
  });
});

router.get('/buyer/products/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  const product = db.prepare(
    `SELECT p.id, p.name, p.description, p.category, p.price, p.stock, p.image_url,
            u.full_name AS seller_name
     FROM products p
     JOIN users u ON u.id = p.seller_id
     WHERE p.id = ?`
  ).get(id);

  if (!product) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  res.render('buyer/products/detail', {
    title: product.name,
    product,
  });
});

router.get('/buyer/account', (req, res) => {
  const user = db.prepare(
    'SELECT id, full_name, email, phone, role, created_at FROM users WHERE id = ?'
  ).get(req.session.userId);

  if (!user) {
    return res.redirect('/logout');
  }

  res.render('buyer/account', {
    title: 'My Account',
    user,
    memberSince: user.created_at.slice(0, 10),
  });
});

router.get('/buyer/orders', (req, res) => {
  res.render('buyer/orders', {
    title: 'My Orders',
  });
});

module.exports = router;