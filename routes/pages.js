const express = require('express');
const { requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('home', { title: 'SANDRONMART' });
});

router.get('/buyer/dashboard', requireRole('BUYER'), (req, res) => {
  res.render('buyer/dashboard', {
    title: 'Buyer Dashboard',
    user: {
      name: req.session.name,
      email: req.session.email,
    },
  });
});

router.get('/seller/dashboard', requireRole('SELLER'), (req, res) => {
  res.render('seller/dashboard', {
    title: 'Seller Dashboard',
    user: {
      name: req.session.name,
      email: req.session.email,
    },
  });
});

module.exports = router;