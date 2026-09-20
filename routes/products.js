const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');
const { validateProduct, PRODUCT_CATEGORIES } = require('../utils/validators');

const router = express.Router();

router.use(requireRole('SELLER'));

function findOwnProduct(id, sellerId) {
  return db.prepare('SELECT * FROM products WHERE id = ? AND seller_id = ?').get(id, sellerId);
}

function listOwnProducts(sellerId) {
  return db.prepare(
    'SELECT * FROM products WHERE seller_id = ? ORDER BY updated_at DESC, id DESC'
  ).all(sellerId);
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeValues(body) {
  return {
    name: (body.name || '').trim(),
    description: (body.description || '').trim(),
    category: (body.category || '').trim(),
    price: (body.price || '').trim(),
    stock: (body.stock || '').trim(),
    imageUrl: (body.imageUrl || '').trim(),
  };
}

router.get('/seller/products', (req, res) => {
  const messages = {};
  if (req.query.created) messages.success = 'Product added successfully.';
  if (req.query.updated) messages.success = 'Product updated successfully.';
  if (req.query.deleted) messages.success = 'Product deleted successfully.';
  if (req.query.error) messages.error = 'Product not found or you do not have permission to manage it.';

  res.render('seller/products/index', {
    title: 'My Products',
    products: listOwnProducts(req.session.userId),
    messages,
  });
});

router.get('/seller/products/new', (req, res) => {
  res.render('seller/products/new', {
    title: 'Add Product',
    categories: PRODUCT_CATEGORIES,
    values: {},
    errors: {},
  });
});

router.post('/seller/products', (req, res) => {
  const values = normalizeValues(req.body);
  const errors = validateProduct(values);

  if (Object.keys(errors).length > 0) {
    return res.status(400).render('seller/products/new', {
      title: 'Add Product',
      categories: PRODUCT_CATEGORIES,
      values,
      errors,
    });
  }

  const result = db.prepare(
    `INSERT INTO products (seller_id, name, description, category, price, stock, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.session.userId,
    values.name,
    values.description,
    values.category,
    Number(values.price),
    Number(values.stock),
    values.imageUrl || null
  );

  return res.redirect('/seller/products?created=1');
});

router.get('/seller/products/:id/edit', (req, res) => {
  const id = parseId(req.params.id);
  const product = (id !== null && findOwnProduct(id, req.session.userId)) || null;
  if (!product) {
    return res.redirect('/seller/products?error=1');
  }

  if (!product) {
    return res.redirect('/seller/products?error=1');
  }

  res.render('seller/products/edit', {
    title: 'Edit Product',
    categories: PRODUCT_CATEGORIES,
    product,
    values: {
      name: product.name,
      description: product.description,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
      imageUrl: product.image_url || '',
    },
    errors: {},
  });
});

router.post('/seller/products/:id/update', (req, res) => {
  const id = parseId(req.params.id);
  const existing = (id !== null && findOwnProduct(id, req.session.userId)) || null;
  if (!existing) {
    return res.redirect('/seller/products?error=1');
  }

  const values = normalizeValues(req.body);
  const errors = validateProduct(values);
  if (Object.keys(errors).length > 0) {
    return res.status(400).render('seller/products/edit', {
      title: 'Edit Product',
      categories: PRODUCT_CATEGORIES,
      values,
      errors,
      product: existing,
    });
  }

  db.prepare(
    `UPDATE products
     SET name = ?, description = ?, category = ?, price = ?, stock = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ? AND seller_id = ?`
  ).run(
    values.name,
    values.description,
    values.category,
    Number(values.price),
    Number(values.stock),
    values.imageUrl || null,
    id,
    req.session.userId
  );

  return res.redirect('/seller/products?updated=1');
});

router.post('/seller/products/:id/delete', (req, res) => {
  const id = parseId(req.params.id);
  const existing = (id !== null && findOwnProduct(id, req.session.userId)) || null;
  if (!existing) {
    return res.redirect('/seller/products?error=1');
  }

  db.prepare('DELETE FROM products WHERE id = ? AND seller_id = ?').run(id, req.session.userId);
  return res.redirect('/seller/products?deleted=1');
});

module.exports = router;