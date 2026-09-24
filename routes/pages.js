const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');
const { statusLabel, formatDateRange, formatOrderDate } = require('../utils/delivery');

const router = express.Router();

function statusCountsByOrder(statusCounts) {
  const counts = { PENDING: 0, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 };
  statusCounts.forEach((row) => {
    counts[row.status] = row.c;
  });
  return counts;
}

router.get('/', (req, res) => {
  res.render('home', { title: 'SANDRONMART' });
});

router.get('/buyer/dashboard', requireRole('BUYER'), (req, res) => {
  const buyerId = req.session.userId;

  const totalOrders = db.prepare(
    'SELECT COUNT(*) AS c FROM orders WHERE buyer_id = ?'
  ).get(buyerId).c;

  const itemsInOrders = db.prepare(
    "SELECT COALESCE(SUM(oi.quantity), 0) AS s FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.buyer_id = ?"
  ).get(buyerId).s;

  const recentOrders = db.prepare(
    `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
            o.delivery_start_date, o.delivery_end_date
     FROM orders o
     WHERE o.buyer_id = ?
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT 5`
  ).all(buyerId).map((order) => {
    const items = db.prepare(
      'SELECT name, price, quantity FROM order_items WHERE order_id = ? ORDER BY id ASC'
    ).all(order.id);
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      statusLabel: statusLabel(order.status),
      total: order.total,
      orderDateLabel: formatOrderDate(order.created_at),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      itemCount,
      items,
    };
  });

  res.render('buyer/dashboard', {
    title: 'Buyer Dashboard',
    user: {
      name: req.session.name,
      email: req.session.email,
    },
    stats: {
      totalOrders,
      itemsInOrders,
      pendingOrders: db.prepare(
        "SELECT COUNT(*) AS c FROM orders WHERE buyer_id = ? AND status = 'PENDING'"
      ).get(buyerId).c,
      deliveredOrders: db.prepare(
        "SELECT COUNT(*) AS c FROM orders WHERE buyer_id = ? AND status = 'DELIVERED'"
      ).get(buyerId).c,
      cancelledOrders: db.prepare(
        "SELECT COUNT(*) AS c FROM orders WHERE buyer_id = ? AND status = 'CANCELLED'"
      ).get(buyerId).c,
    },
    recentOrders,
  });
});

router.get('/seller/dashboard', requireRole('SELLER'), (req, res) => {
  const sellerId = req.session.userId;

  const totalOrders = db.prepare(
    `SELECT COUNT(DISTINCT o.id) AS c
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.seller_id = ?`
  ).get(sellerId).c;

  const statusCounts = statusCountsByOrder(
    db.prepare(
      `SELECT o.status AS status, COUNT(DISTINCT o.id) AS c
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.seller_id = ?
       GROUP BY o.status`
    ).all(sellerId)
  );

  const unitsSold = db.prepare(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS s
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.seller_id = ? AND o.status != 'CANCELLED'`
  ).get(sellerId).s;

  res.render('seller/dashboard', {
    title: 'Seller Dashboard',
    user: {
      name: req.session.name,
      email: req.session.email,
    },
    stats: {
      totalOrders,
      unitsSold,
      statusCounts,
    },
  });
});

module.exports = router;