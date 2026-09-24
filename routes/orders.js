const express = require('express');
const db = require('../config/db');
const shop = require('../config/shop');
const { requireRole } = require('../middlewares/auth');
const {
  validateAddress,
  validateIndianMobile,
  validatePincode,
  INDIA_STATES,
} = require('../utils/validators');
const {
  computeDeliveryWindow,
  buildTimeline,
  formatDateRange,
  formatOrderDate,
  statusLabel,
  nextStatus,
} = require('../utils/delivery');
const { formatINR } = require('../utils/currency');

const router = express.Router();

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function singleParam(value) {
  return Array.isArray(value) ? (value[0] || '') : (value || '');
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function cartItems(buyerId) {
  return db.prepare(
    `SELECT c.id AS cart_id, c.quantity,
            p.id AS product_id, p.name, p.category, p.price, p.image_url, p.stock,
            p.seller_id
     FROM cart_items c
     JOIN products p ON p.id = c.product_id
     WHERE c.buyer_id = ?
     ORDER BY c.created_at DESC, c.id DESC`
  ).all(buyerId);
}

function computeTotals(items) {
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
  const deliveryCharge = subtotal >= shop.FREE_DELIVERY_THRESHOLD ? 0 : shop.DELIVERY_CHARGE;
  const total = round2(subtotal + deliveryCharge);
  return { subtotal, deliveryCharge, total };
}

function buyerAddresses(buyerId) {
  return db.prepare(
    'SELECT * FROM addresses WHERE buyer_id = ? ORDER BY is_default DESC, updated_at DESC, id DESC'
  ).all(buyerId);
}

function listBuyerOrders(buyerId) {
  return db.prepare(
    `SELECT o.*,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     WHERE o.buyer_id = ?
     ORDER BY o.created_at DESC, o.id DESC`
  ).all(buyerId);
}

function orderItems(orderId) {
  return db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC').all(orderId);
}

function findBuyerOrder(orderId, buyerId) {
  const id = parseId(orderId);
  if (id === null) return null;
  return db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(id, buyerId);
}

function orderEvents(orderId) {
  return db.prepare(
    'SELECT * FROM order_status_events WHERE order_id = ? ORDER BY id ASC'
  ).all(orderId);
}

function generateOrderNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `SM${stamp}`;
  const row = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE order_number LIKE ?').get(`${prefix}%`);
  const seq = row.c + 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

function hasValidationErrors(errors) {
  const keys = Object.keys(errors || {}).filter((key) => key !== '__clean');
  return keys.some((key) => Array.isArray(errors[key]) && errors[key].length > 0);
}

function cleanErrors(errors) {
  const copy = Object.assign({}, errors);
  delete copy.__clean;
  return copy;
}

function loadCheckoutViewData(buyerId, values, errors) {
  const items = cartItems(buyerId);
  const totals = computeTotals(items);
  return {
    title: 'Checkout',
    items,
    addresses: buyerAddresses(buyerId),
    subtotal: totals.subtotal,
    deliveryCharge: totals.deliveryCharge,
    total: totals.total,
    freeDeliveryThreshold: shop.FREE_DELIVERY_THRESHOLD,
    deliveryWindow: computeDeliveryWindow(new Date()),
    timeSlots: shop.TIME_SLOTS,
    paymentMethods: shop.PAYMENT_METHODS,
    states: INDIA_STATES,
    values: values || {},
    errors: cleanErrors(errors || {}),
  };
}

/* ============================== Checkout ============================== */

router.get('/buyer/checkout', requireRole('BUYER'), (req, res) => {
  if (cartItems(req.session.userId).length === 0) {
    return res.redirect('/buyer/cart');
  }
  res.render('buyer/checkout', loadCheckoutViewData(req.session.userId, {}, {}));
});

function paymentLabel(code) {
  const found = shop.PAYMENT_METHODS.find((p) => p.code === code);
  return found ? found.label : code;
}

router.post('/buyer/checkout', requireRole('BUYER'), (req, res) => {
  const buyerId = req.session.userId;

  if (cartItems(buyerId).length === 0) {
    return res.redirect('/buyer/cart');
  }

  const errors = {};

  // ----- 1. Delivery address -----
  const addressIdRaw = singleParam(req.body.address_id);
  let address = null;
  let savedAddressFields = null;
  let addressIsNew = false;

  if (addressIdRaw && addressIdRaw !== 'new') {
    const id = parseId(addressIdRaw);
    address = (id !== null && db.prepare(
      'SELECT * FROM addresses WHERE id = ? AND buyer_id = ?'
    ).get(id, buyerId)) || null;
    if (!address) {
      errors.general = ['Please choose a valid delivery address.'];
    }
  } else {
    addressIsNew = true;
    const validation = validateAddress(req.body);
    if (hasValidationErrors(validation)) {
      return res.status(400).render('buyer/checkout', loadCheckoutViewData(buyerId, req.body, validation));
    }
    savedAddressFields = validation.__clean;
    address = savedAddressFields;
  }

  // ----- 2. Delivery time slot -----
  const timeSlot = singleParam(req.body.delivery_time_slot);
  if (!shop.TIME_SLOTS.includes(timeSlot)) {
    errors.delivery_time_slot = ['Please select a preferred delivery time slot.'];
  }

  // ----- 3. Payment method -----
  const paymentMethod = singleParam(req.body.payment_method);
  if (!shop.PAYMENT_METHODS.some((p) => p.code === paymentMethod)) {
    errors.payment_method = ['Please choose a payment method.'];
  }

  if (hasValidationErrors(errors)) {
    return res.status(400).render('buyer/checkout', loadCheckoutViewData(buyerId, req.body, errors));
  }

  const shouldSaveAddress = addressIsNew && (req.body.save_address === '1' || req.body.save_address === true);

  const placeOrder = db.transaction(() => {
    const freshItems = cartItems(buyerId);
    if (freshItems.length === 0) {
      throw new Error('EMPTY_CART');
    }

    for (const item of freshItems) {
      if (item.stock < item.quantity) {
        const error = new Error('NOT_ENOUGH_STOCK');
        error.itemName = item.name;
        error.available = item.stock;
        throw error;
      }
    }

    const totals = computeTotals(freshItems);
    const deliveryWindow = computeDeliveryWindow(new Date());
    const orderNumber = generateOrderNumber();

    const orderInfo = db.prepare(
      `INSERT INTO orders
       (order_number, buyer_id, subtotal, delivery_charge, total,
        full_name, phone, house_number, street, landmark, city, district, state, pincode,
        delivery_start_date, delivery_end_date, delivery_time_slot, payment_method, payment_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderNumber, buyerId, totals.subtotal, totals.deliveryCharge, totals.total,
      address.full_name, address.phone, address.house_number, address.street,
      address.landmark || null, address.city, address.district || null, address.state, address.pincode,
      deliveryWindow.start, deliveryWindow.end, timeSlot, paymentMethod,
      paymentMethod === 'COD' ? 'PENDING' : 'PAID',
      'PENDING'
    );
    const orderId = orderInfo.lastInsertRowid;

    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, product_id, seller_id, name, price, quantity, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const reduceStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of freshItems) {
      insertItem.run(
        orderId, item.product_id, item.seller_id, item.name, Number(item.price), item.quantity, item.image_url
      );
      reduceStock.run(item.quantity, item.product_id);
    }

    if (shouldSaveAddress && savedAddressFields) {
      const existingCount = db.prepare(
        'SELECT COUNT(*) AS c FROM addresses WHERE buyer_id = ?'
      ).get(buyerId).c;
      db.prepare(
        `INSERT INTO addresses
         (buyer_id, full_name, phone, house_number, street, landmark, city, district, state, pincode, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        buyerId, savedAddressFields.full_name, savedAddressFields.phone,
        savedAddressFields.house_number, savedAddressFields.street, savedAddressFields.landmark || null,
        savedAddressFields.city, savedAddressFields.district || null, savedAddressFields.state,
        savedAddressFields.pincode, existingCount === 0 ? 1 : 0
      );
    }

    db.prepare("INSERT INTO order_status_events (order_id, status) VALUES (?, 'PENDING')").run(orderId);
    db.prepare('DELETE FROM cart_items WHERE buyer_id = ?').run(buyerId);

    return orderId;
  });

  let orderId;
  try {
    orderId = placeOrder();
  } catch (error) {
    if (error.message === 'EMPTY_CART') {
      return res.redirect('/buyer/cart');
    }
    if (error.message === 'NOT_ENOUGH_STOCK') {
      return res.redirect(`/buyer/cart?stock=1`);
    }
    console.error('checkout failed:', error);
    errors.general = ['We could not place your order. Please try again.'];
    return res.status(500).render('buyer/checkout', loadCheckoutViewData(buyerId, req.body, errors));
  }

  return res.redirect(`/buyer/orders/${orderId}/confirmation`);
});

/* ============================== Buyer orders ============================== */

router.get('/buyer/orders', requireRole('BUYER'), (req, res) => {
  const orders = listBuyerOrders(req.session.userId).map((order) => {
    return Object.assign({}, order, {
      items: orderItems(order.id),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      orderDateLabel: formatOrderDate(order.created_at),
    });
  });

  res.render('buyer/orders', {
    title: 'My Orders',
    orders,
  });
});

router.get('/buyer/orders/:id', requireRole('BUYER'), (req, res) => {
  const order = findBuyerOrder(req.params.id, req.session.userId);
  if (!order) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  res.render('buyer/order-details', {
    title: `Order ${order.order_number}`,
    order: Object.assign({}, order, {
      items: orderItems(order.id),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      orderDateLabel: formatOrderDate(order.created_at),
      paymentLabel: paymentLabel(order.payment_method),
      statusLabel: statusLabel(order.status),
    }),
  });
});

router.get('/buyer/orders/:id/confirmation', requireRole('BUYER'), (req, res) => {
  const order = findBuyerOrder(req.params.id, req.session.userId);
  if (!order) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  res.render('buyer/order-confirmation', {
    title: 'Order Confirmed',
    order: Object.assign({}, order, {
      items: orderItems(order.id),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      orderDateLabel: formatOrderDate(order.created_at),
      paymentLabel: paymentLabel(order.payment_method),
    }),
  });
});

router.get('/buyer/orders/:id/track', requireRole('BUYER'), (req, res) => {
  const order = findBuyerOrder(req.params.id, req.session.userId);
  if (!order) {
    return res.status(404).render('404', { title: 'Not Found' });
  }

  const timeline = buildTimeline(order, orderEvents(order.id));

  res.render('buyer/order-track', {
    title: `Track Order ${order.order_number}`,
    order: Object.assign({}, order, {
      items: orderItems(order.id),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      orderDateLabel: formatOrderDate(order.created_at),
      statusLabel: statusLabel(order.status),
    }),
    timeline,
  });
});

/* ============================== Saved addresses ============================== */

router.get('/buyer/addresses', requireRole('BUYER'), (req, res) => {
  const messages = {};
  if (req.query.saved) messages.success = 'Address saved successfully.';
  if (req.query.updated) messages.success = 'Address updated successfully.';
  if (req.query.deleted) messages.success = 'Address removed.';
  if (req.query.deflt) messages.success = 'Default address updated.';

  res.render('buyer/addresses', {
    title: 'Saved Addresses',
    addresses: buyerAddresses(req.session.userId),
    states: INDIA_STATES,
    messages,
    values: {},
    errors: {},
  });
});

router.post('/buyer/addresses', requireRole('BUYER'), (req, res) => {
  const validation = validateAddress(req.body);
  if (hasValidationErrors(validation)) {
    return res.status(400).render('buyer/addresses', {
      title: 'Saved Addresses',
      addresses: buyerAddresses(req.session.userId),
      states: INDIA_STATES,
      messages: {},
      values: req.body,
      errors: cleanErrors(validation),
    });
  }

  const clean = validation.__clean;
  const existingCount = db.prepare(
    'SELECT COUNT(*) AS c FROM addresses WHERE buyer_id = ?'
  ).get(req.session.userId).c;

  db.prepare(
    `INSERT INTO addresses
     (buyer_id, full_name, phone, house_number, street, landmark, city, district, state, pincode, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.session.userId, clean.full_name, clean.phone, clean.house_number, clean.street,
    clean.landmark || null, clean.city, clean.district || null, clean.state, clean.pincode,
    existingCount === 0 ? 1 : 0
  );

  return res.redirect('/buyer/addresses?saved=1');
});

router.get('/buyer/addresses/:id/edit', requireRole('BUYER'), (req, res) => {
  const id = parseId(req.params.id);
  const address = (id !== null && db.prepare(
    'SELECT * FROM addresses WHERE id = ? AND buyer_id = ?'
  ).get(id, req.session.userId)) || null;
  if (!address) {
    return res.redirect('/buyer/addresses');
  }

  res.render('buyer/address-edit', {
    title: 'Edit Address',
    address,
    states: INDIA_STATES,
    values: {
      full_name: address.full_name,
      phone: address.phone,
      house_number: address.house_number,
      street: address.street,
      landmark: address.landmark || '',
      city: address.city,
      district: address.district || '',
      state: address.state,
      pincode: address.pincode,
    },
    errors: {},
  });
});

router.post('/buyer/addresses/:id/update', requireRole('BUYER'), (req, res) => {
  const id = parseId(req.params.id);
  const existing = (id !== null && db.prepare(
    'SELECT * FROM addresses WHERE id = ? AND buyer_id = ?'
  ).get(id, req.session.userId)) || null;
  if (!existing) {
    return res.redirect('/buyer/addresses');
  }

  const validation = validateAddress(req.body);
  if (hasValidationErrors(validation)) {
    return res.status(400).render('buyer/address-edit', {
      title: 'Edit Address',
      address: existing,
      states: INDIA_STATES,
      values: req.body,
      errors: cleanErrors(validation),
    });
  }

  const clean = validation.__clean;
  db.prepare(
    `UPDATE addresses
     SET full_name = ?, phone = ?, house_number = ?, street = ?, landmark = ?,
         city = ?, district = ?, state = ?, pincode = ?, updated_at = datetime('now')
     WHERE id = ? AND buyer_id = ?`
  ).run(
    clean.full_name, clean.phone, clean.house_number, clean.street, clean.landmark || null,
    clean.city, clean.district || null, clean.state, clean.pincode, id, req.session.userId
  );

  return res.redirect('/buyer/addresses?updated=1');
});

router.post('/buyer/addresses/:id/default', requireRole('BUYER'), (req, res) => {
  const id = parseId(req.params.id);
  const existing = (id !== null && db.prepare(
    'SELECT * FROM addresses WHERE id = ? AND buyer_id = ?'
  ).get(id, req.session.userId)) || null;
  if (!existing) {
    return res.redirect('/buyer/addresses');
  }

  db.prepare('UPDATE addresses SET is_default = 0, updated_at = datetime(\'now\') WHERE buyer_id = ?')
    .run(req.session.userId);
  db.prepare('UPDATE addresses SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?')
    .run(existing.id);

  return res.redirect('/buyer/addresses?deflt=1');
});

router.post('/buyer/addresses/:id/delete', requireRole('BUYER'), (req, res) => {
  const id = parseId(req.params.id);
  const existing = (id !== null && db.prepare(
    'SELECT * FROM addresses WHERE id = ? AND buyer_id = ?'
  ).get(id, req.session.userId)) || null;
  if (!existing) {
    return res.redirect('/buyer/addresses');
  }

  db.prepare('DELETE FROM addresses WHERE id = ? AND buyer_id = ?').run(id, req.session.userId);

  const remaining = db.prepare(
    'SELECT COUNT(*) AS c FROM addresses WHERE buyer_id = ?'
  ).get(req.session.userId).c;
  if (existing.is_default === 1 && remaining > 0) {
    db.prepare(
      'UPDATE addresses SET is_default = 1 WHERE id = (SELECT id FROM addresses WHERE buyer_id = ? ORDER BY id ASC LIMIT 1)'
    ).run(req.session.userId);
  }

  return res.redirect('/buyer/addresses?deleted=1');
});

/* ============================== Seller order management ============================== */

function sellerOrders(sellerId) {
  return db.prepare(
    `SELECT DISTINCT o.*
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.seller_id = ?
     ORDER BY o.created_at DESC, o.id DESC`
  ).all(sellerId);
}

function findSellerOrder(orderId, sellerId) {
  const id = parseId(orderId);
  if (id === null) return null;
  return db.prepare(
    `SELECT o.*
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = ? AND oi.seller_id = ?
     LIMIT 1`
  ).get(id, sellerId);
}

function sellerOrderItems(orderId, sellerId) {
  return db.prepare(
    'SELECT * FROM order_items WHERE order_id = ? AND seller_id = ? ORDER BY id ASC'
  ).all(orderId, sellerId);
}

router.get('/seller/orders', requireRole('SELLER'), (req, res) => {
  const messages = {};
  if (req.query.updated) messages.success = 'Order status updated successfully.';
  if (req.query.error) messages.error = 'This order is not available to you or cannot be updated in that way.';

  const orders = sellerOrders(req.session.userId).map((order) => {
    return Object.assign({}, order, {
      items: sellerOrderItems(order.id, req.session.userId),
      deliveryLabel: formatDateRange(order.delivery_start_date, order.delivery_end_date),
      orderDateLabel: formatOrderDate(order.created_at),
      statusLabel: statusLabel(order.status),
    });
  });

  res.render('seller/orders', {
    title: 'Incoming Orders',
    orders,
    messages,
    statusFlow: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'],
    orderStatusLabel: statusLabel,
    nextStatusOf: nextStatus,
  });
});

router.post('/seller/orders/:id/status', requireRole('SELLER'), (req, res) => {
  const sellerId = req.session.userId;
  const order = findSellerOrder(req.params.id, sellerId);
  const status = singleParam(req.body.status);

  if (!order) {
    return res.redirect('/seller/orders?error=1');
  }

  if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
    return res.redirect('/seller/orders?error=1');
  }

  const allowed = nextStatus(order.status) === status || (status === 'CANCELLED');
  if (!allowed || !shop.ORDER_STATUSES.includes(status)) {
    return res.redirect('/seller/orders?error=1');
  }

  db.prepare(
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, order.id);
  db.prepare(
    "INSERT INTO order_status_events (order_id, status) VALUES (?, ?)"
  ).run(order.id, status);

  return res.redirect('/seller/orders?updated=1');
});

module.exports = router;