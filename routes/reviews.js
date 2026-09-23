const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');
const { validateReview } = require('../utils/validators');

const router = express.Router();

router.use('/buyer', requireRole('BUYER'));

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function singleParam(value) {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function loadOwnReview(productId, userId) {
  return db.prepare(
    'SELECT * FROM product_reviews WHERE product_id = ? AND user_id = ?'
  ).get(productId, userId);
}

// Creates a new review, or updates the reviewer's existing review for the same
// product. The UNIQUE (product_id, user_id) constraint guarantees a single
// review per user per product, so this route can never create a duplicate.
router.post('/buyer/reviews', (req, res) => {
  const productId = parseId(singleParam(req.body.product_id));
  if (productId === null) {
    return res.redirect('/buyer/products');
  }

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.redirect('/buyer/products?notfound=1');
  }

  const values = {
    product_id: String(productId),
    rating: singleParam(req.body.rating),
    comment: typeof req.body.comment === 'string' ? req.body.comment.trim() : '',
  };
  const errors = validateReview(values);
  if (Object.keys(errors).length > 0) {
    req.session.reviewFlash = {
      error: (errors.rating && errors.rating[0]) || (errors.comment && errors.comment[0]),
      rating: values.rating,
      comment: values.comment,
    };
    return res.redirect(`/buyer/products/${productId}#reviews`);
  }

  const existing = loadOwnReview(productId, req.session.userId);
  if (existing) {
    db.prepare(
      "UPDATE product_reviews SET rating = ?, comment = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(Number(values.rating), values.comment, existing.id, req.session.userId);
    req.session.reviewFlash = { success: 'Your review has been updated.' };
  } else {
    db.prepare(
      'INSERT INTO product_reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)'
    ).run(productId, req.session.userId, Number(values.rating), values.comment);
    req.session.reviewFlash = { success: 'Your review has been posted.' };
  }

  return res.redirect(`/buyer/products/${productId}#reviews`);
});

router.post('/buyer/reviews/:id/update', (req, res) => {
  const reviewId = parseId(req.params.id);
  const review = (reviewId !== null &&
    db.prepare('SELECT * FROM product_reviews WHERE id = ? AND user_id = ?').get(
      reviewId,
      req.session.userId
    )) || null;
  if (!review) {
    return res.redirect('/buyer/products');
  }

  const values = {
    product_id: String(review.product_id),
    rating: singleParam(req.body.rating),
    comment: typeof req.body.comment === 'string' ? req.body.comment.trim() : '',
  };
  const errors = validateReview(values);
  if (Object.keys(errors).length > 0) {
    req.session.reviewFlash = {
      error: (errors.rating && errors.rating[0]) || (errors.comment && errors.comment[0]),
      rating: values.rating,
      comment: values.comment,
    };
    return res.redirect(`/buyer/products/${review.product_id}#reviews`);
  }

  db.prepare(
    "UPDATE product_reviews SET rating = ?, comment = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).run(Number(values.rating), values.comment, reviewId, req.session.userId);
  req.session.reviewFlash = { success: 'Your review has been updated.' };

  return res.redirect(`/buyer/products/${review.product_id}#reviews`);
});

router.post('/buyer/reviews/:id/delete', (req, res) => {
  const reviewId = parseId(req.params.id);
  const review = (reviewId !== null &&
    db.prepare('SELECT * FROM product_reviews WHERE id = ? AND user_id = ?').get(
      reviewId,
      req.session.userId
    )) || null;
  if (!review) {
    return res.redirect('/buyer/products');
  }

  db.prepare(
    'DELETE FROM product_reviews WHERE id = ? AND user_id = ?'
  ).run(reviewId, req.session.userId);
  req.session.reviewFlash = { success: 'Your review has been deleted.' };

  return res.redirect(`/buyer/products/${review.product_id}#reviews`);
});

module.exports = router;