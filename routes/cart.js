const express = require('express');
const db = require('../config/db');
const shop = require('../config/shop');
const { requireRole } = require('../middlewares/auth');

const router = express.Router();

function round2(value) {
  return Math.round(value * 100) / 100;
}

router.use('/buyer', requireRole('BUYER'));

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseQuantity(raw) {
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!/^\d+$/.test(String(value).trim())) {
    return null;
  }
  return Number(value);
}

function findOwnCartItem(cartId, buyerId) {
  return db.prepare(
    'SELECT * FROM cart_items WHERE id = ? AND buyer_id = ?'
  ).get(cartId, buyerId);
}

function cartMessages(query) {
  const messages = {};
  if (query.added) messages.success = 'Product added to your cart.';
  if (query.updated) messages.success = 'Cart updated successfully.';
  if (query.removed) messages.success = 'Product removed from your cart.';
  if (query.stock) messages.error = 'Quantity cannot exceed available stock.';
  if (query.notfound) messages.error = 'That product is no longer available.';
  if (query.invalid) messages.error = 'Invalid cart item or action.';
  return messages;
}

router.get('/buyer/cart', (req, res) => {
  const items = db.prepare(
    `SELECT c.id AS cart_id, c.quantity,
            p.id AS product_id, p.name, p.category, p.price, p.image_url, p.stock,
            c.updated_at AS sort_key
     FROM cart_items c
     JOIN products p ON p.id = c.product_id
     WHERE c.buyer_id = ?
     ORDER BY c.updated_at DESC, c.id DESC`
  ).all(req.session.userId);

  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
  const deliveryCharge = subtotal >= shop.FREE_DELIVERY_THRESHOLD ? 0 : shop.DELIVERY_CHARGE;
  const total = round2(subtotal + deliveryCharge);

  res.render('buyer/cart', {
    title: 'Your Cart',
    items,
    subtotal,
    deliveryCharge,
    total,
    freeDeliveryThreshold: shop.FREE_DELIVERY_THRESHOLD,
    messages: cartMessages(req.query),
  });
});

router.post('/buyer/cart/add', (req, res) => {
  const productId = parseId(req.body.product_id);
  if (productId === null) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  const quantity = parseQuantity(req.body.quantity);
  if (quantity === null || quantity < 1) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.redirect('/buyer/cart?notfound=1');
  }

  const existing = db.prepare(
    'SELECT * FROM cart_items WHERE buyer_id = ? AND product_id = ?'
  ).get(req.session.userId, productId);
  const current = existing ? existing.quantity : 0;
  const target = current + quantity;

  if (target > product.stock) {
    return res.redirect('/buyer/cart?stock=1');
  }

  if (existing) {
    db.prepare(
      "UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(target, existing.id);
  } else {
    db.prepare(
      'INSERT INTO cart_items (buyer_id, product_id, quantity) VALUES (?, ?, ?)'
    ).run(req.session.userId, productId, quantity);
  }

  return res.redirect('/buyer/cart?added=1');
});

router.post('/buyer/cart/:id/update', (req, res) => {
  const cartId = parseId(req.params.id);
  if (cartId === null) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  const item = findOwnCartItem(cartId, req.session.userId);
  if (!item) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
  if (!product) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(cartId);
    return res.redirect('/buyer/cart?notfound=1');
  }

  const action = req.body.action || '';
  let quantity = item.quantity;

  if (action === 'increase') {
    if (quantity >= product.stock) {
      return res.redirect('/buyer/cart?stock=1');
    }
    quantity += 1;
  } else if (action === 'decrease') {
    quantity = Math.max(item.quantity - 1, 1);
  } else {
    return res.redirect('/buyer/cart?invalid=1');
  }

  db.prepare(
    "UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(quantity, cartId);

  return res.redirect('/buyer/cart?updated=1');
});

router.post('/buyer/cart/:id/remove', (req, res) => {
  const cartId = parseId(req.params.id);
  if (cartId === null) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  const item = findOwnCartItem(cartId, req.session.userId);
  if (!item) {
    return res.redirect('/buyer/cart?invalid=1');
  }

  db.prepare(
    'DELETE FROM cart_items WHERE id = ? AND buyer_id = ?'
  ).run(cartId, req.session.userId);

  return res.redirect('/buyer/cart?removed=1');
});

module.exports = router;