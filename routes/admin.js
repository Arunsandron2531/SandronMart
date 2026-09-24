const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middlewares/auth');
const { statusLabel, formatOrderDate, formatDateTime } = require('../utils/delivery');

const router = express.Router();

// Every /admin route is protected by the ADMIN role. Anonymous visitors are
// redirected to the normal login page; logged-in buyers/sellers get a 403 page.
router.use('/admin', requireRole('ADMIN'));

function decorateOrders(orders) {
  return orders.map((order) => ({
    ...order,
    orderDateLabel: formatOrderDate(order.created_at),
    placedAtLabel: formatDateTime(order.created_at),
    statusLabel: statusLabel(order.status),
  }));
}

router.get('/admin/dashboard', (req, res) => {
  const stats = {
    totalProducts: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
    totalBuyers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'BUYER'").get().c,
    totalSellers: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'SELLER'").get().c,
    totalOrders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
  };

  const statusRows = db.prepare(
    'SELECT status, COUNT(*) AS c FROM orders GROUP BY status'
  ).all();
  const statusCounts = { PENDING: 0, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 };
  statusRows.forEach((row) => {
    statusCounts[row.status] = row.c;
  });
  stats.statusCounts = statusCounts;
  stats.deliveredOrders = statusCounts.DELIVERED;
  stats.pendingOrders = statusCounts.PENDING;
  stats.cancelledOrders = statusCounts.CANCELLED;

  const totalStatused = statusRows.reduce((sum, row) => sum + row.c, 0);
  const chart = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    .map((status) => {
      const count = statusCounts[status];
      return {
        status,
        label: statusLabel(status),
        count,
        percent: totalStatused > 0 ? Math.round((count / totalStatused) * 100) : 0,
      };
    })
    .filter((entry) => entry.count > 0 || true);

  const recentOrders = decorateOrders(
    db.prepare(
      `SELECT o.id, o.order_number, o.total, o.payment_method, o.status, o.created_at,
              u.full_name AS buyer_name, u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 10`
    ).all()
  );

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    user: { name: req.session.name, email: req.session.email },
    stats,
    chart,
    recentOrders,
  });
});

router.get('/admin/products', (req, res) => {
  const products = db.prepare(
    `SELECT p.id, p.name, p.description, p.category, p.price, p.stock, p.image_url, p.created_at,
            u.full_name AS seller_name, u.email AS seller_email
     FROM products p
     JOIN users u ON u.id = p.seller_id
     ORDER BY p.created_at DESC, p.id DESC`
  ).all();

  res.render('admin/products', {
    title: 'All Products',
    user: { name: req.session.name, email: req.session.email },
    products,
  });
});

router.get('/admin/buyers', (req, res) => {
  const buyers = db.prepare(
    `SELECT id, full_name, email, phone, created_at
     FROM users WHERE role = 'BUYER' ORDER BY created_at DESC, id DESC`
  ).all();

  res.render('admin/users', {
    title: 'All Buyers',
    user: { name: req.session.name, email: req.session.email },
    heading: 'Buyers',
    emptyMessage: 'No buyer accounts yet.',
    users: buyers,
  });
});

router.get('/admin/sellers', (req, res) => {
  const sellers = db.prepare(
    `SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
            (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id) AS product_count
     FROM users u WHERE u.role = 'SELLER' ORDER BY u.created_at DESC, u.id DESC`
  ).all();

  res.render('admin/users', {
    title: 'All Sellers',
    user: { name: req.session.name, email: req.session.email },
    heading: 'Sellers',
    emptyMessage: 'No seller accounts yet.',
    users: sellers,
  });
});

router.get('/admin/orders', (req, res) => {
  const orders = decorateOrders(
    db.prepare(
      `SELECT o.id, o.order_number, o.total, o.payment_method, o.payment_status, o.status, o.created_at,
              u.full_name AS buyer_name, u.email AS buyer_email
       FROM orders o
       JOIN users u ON u.id = o.buyer_id
       ORDER BY o.created_at DESC, o.id DESC`
    ).all()
  );

  res.render('admin/orders', {
    title: 'All Orders',
    user: { name: req.session.name, email: req.session.email },
    orders,
  });
});

router.get('/admin/orders/:id', (req, res) => {
  const id = Number(req.params.id);
  const order = db.prepare(
    `SELECT o.*, u.full_name AS buyer_name, u.email AS buyer_email
     FROM orders o
     JOIN users u ON u.id = o.buyer_id
     WHERE o.id = ?`
  ).get(id);

  if (!order) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  const items = db.prepare(
    `SELECT oi.name, oi.price, oi.quantity, oi.image_url,
            u.full_name AS seller_name
     FROM order_items oi
     JOIN users u ON u.id = oi.seller_id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`
  ).all(id);

  res.render('admin/order-details', {
    title: `Order ${order.order_number}`,
    user: { name: req.session.name, email: req.session.email },
    order: {
      ...order,
      orderDateLabel: formatOrderDate(order.created_at),
      statusLabel: statusLabel(order.status),
    },
    items,
  });
});

module.exports = router;