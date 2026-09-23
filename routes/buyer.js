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
  const term = (search || '').trim().slice(0, 100);
  const where = [];
  const params = [];

  if (category && category !== 'All Categories' && PRODUCT_CATEGORIES.includes(category)) {
    where.push('category = ?');
    params.push(category);
  }

  if (term) {
    where.push(
      `(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')`
    );
    const like = `%${escapeLike(term)}%`;
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

  const wishlistIds = new Set(
    db.prepare('SELECT product_id FROM wishlist_items WHERE buyer_id = ?')
      .all(req.session.userId)
      .map((row) => row.product_id)
  );

  const messages = {};
  if (req.query.added) messages.success = 'Added to your wishlist.';
  if (req.query.removed) messages.success = 'Removed from your wishlist.';
  if (req.query.notfound) messages.error = 'That product is no longer available.';
  if (req.query.invalid) messages.error = 'Invalid wishlist item.';

  res.render('buyer/products/index', {
    title: 'Browse Products',
    products,
    categories: PRODUCT_CATEGORIES,
    search,
    selectedCategory: PRODUCT_CATEGORIES.includes(category) ? category : '',
    wishlistIds,
    messages,
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

  const wishlistIds = new Set(
    db.prepare('SELECT product_id FROM wishlist_items WHERE buyer_id = ?')
      .all(req.session.userId)
      .map((row) => row.product_id)
  );

  const reviewStats = db.prepare(
    'SELECT COUNT(*) AS count, AVG(rating) AS avgRating FROM product_reviews WHERE product_id = ?'
  ).get(id);
  const reviews = db.prepare(
    `SELECT r.id, r.rating, r.comment, r.created_at,
            u.full_name AS reviewer_name
     FROM product_reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ?
     ORDER BY r.updated_at DESC, r.id DESC`
  ).all(id);
  const myReview = db.prepare(
    'SELECT id, rating, comment FROM product_reviews WHERE product_id = ? AND user_id = ?'
  ).get(id, req.session.userId);

  const reviewFlash = req.session.reviewFlash || null;
  delete req.session.reviewFlash;

  res.render('buyer/products/detail', {
    title: product.name,
    product,
    wishlistIds,
    reviewStats: {
      count: reviewStats.count,
      avgRating: reviewStats.count > 0 ? Math.round(reviewStats.avgRating * 10) / 10 : null,
    },
    reviews,
    myReview,
    reviewFlash,
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

module.exports = router;