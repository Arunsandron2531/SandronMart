const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');

const router = express.Router();

router.use('/buyer', requireRole('BUYER'));

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function singleParam(value) {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

// The heart sits on product cards and the product detail page. The submitting
// form carries the current path so the toggle can send the buyer back exactly
// where they were. Only buyer routes are accepted; anything else falls back to
// the product list.
function safeRedirect(raw) {
  const value = singleParam(raw);
  if (typeof value === 'string' && value.startsWith('/buyer/') && !value.includes('\n') && value.length < 300) {
    return value;
  }
  return '/buyer/products';
}

function findWishlistRow(buyerId, productId) {
  return db.prepare(
    'SELECT * FROM wishlist_items WHERE buyer_id = ? AND product_id = ?'
  ).get(buyerId, productId);
}

function wishlistMessages(query) {
  const messages = {};
  if (query.added) messages.success = 'Added to your wishlist.';
  if (query.removed) messages.success = 'Removed from your wishlist.';
  if (query.invalid) messages.error = 'Invalid wishlist item.';
  if (query.notfound) messages.error = 'That product is no longer available.';
  return messages;
}

router.get('/buyer/wishlist', (req, res) => {
  const items = db.prepare(
    `SELECT w.id AS wishlist_id, w.created_at,
            p.id AS product_id, p.name, p.category, p.price, p.stock, p.image_url
     FROM wishlist_items w
     JOIN products p ON p.id = w.product_id
     WHERE w.buyer_id = ?
     ORDER BY w.created_at DESC, w.id DESC`
  ).all(req.session.userId);

  res.render('buyer/wishlist', {
    title: 'My Wishlist',
    items,
    messages: wishlistMessages(req.query),
  });
});

router.post('/buyer/wishlist/toggle', (req, res) => {
  const productId = parseId(singleParam(req.body.product_id));
  if (productId === null) {
    return res.redirect(safeRedirect(req.body.redirect) + '?invalid=1');
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.redirect(safeRedirect(req.body.redirect) + '?notfound=1');
  }

  const existing = findWishlistRow(req.session.userId, productId);
  if (existing) {
    db.prepare('DELETE FROM wishlist_items WHERE id = ? AND buyer_id = ?').run(
      existing.id,
      req.session.userId
    );
    return res.redirect(safeRedirect(req.body.redirect) + '?removed=1');
  }

  db.prepare(
    'INSERT INTO wishlist_items (buyer_id, product_id) VALUES (?, ?)'
  ).run(req.session.userId, productId);

  return res.redirect(safeRedirect(req.body.redirect) + '?added=1');
});

router.post('/buyer/wishlist/:id/remove', (req, res) => {
  const wishlistId = parseId(req.params.id);
  if (wishlistId === null) {
    return res.redirect('/buyer/wishlist?invalid=1');
  }

  const item = db.prepare(
    'SELECT id FROM wishlist_items WHERE id = ? AND buyer_id = ?'
  ).get(wishlistId, req.session.userId);
  if (!item) {
    return res.redirect('/buyer/wishlist?invalid=1');
  }

  db.prepare('DELETE FROM wishlist_items WHERE id = ? AND buyer_id = ?').run(
    wishlistId,
    req.session.userId
  );

  return res.redirect('/buyer/wishlist?removed=1');
});

module.exports = router;