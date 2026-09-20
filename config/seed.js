const bcrypt = require('bcryptjs');

const DEMO_SELLER_EMAIL = 'demo.seller@sandronmart.local';

const DEMO_PRODUCTS = [
  ['Snake Plant', 'A hardy low-light indoor plant.', 'Indoor Plants', '18.00', '12'],
  ['Money Plant', 'A lucky easy-care indoor vine.', 'Indoor Plants', '6.50', '15'],
  ['Succulent Mix', 'A colorful set of easy-care succulents.', 'Indoor Plants', '14.00', '9'],
  ['Rose Plant', 'Beautiful red roses for your garden.', 'Outdoor Plants', '12.99', '10'],
  ['Lavender Plant', 'Fragrant purple lavender for sunny beds.', 'Outdoor Plants', '11.50', '14'],
  ['Pea Seeds', 'Sweet green peas for your patch.', 'Seeds', '2.50', '40'],
  ['Sunflower Seeds', 'Tall bright sunflowers for summer.', 'Seeds', '1.99', '60'],
  ['Plant Pot', 'Durable clay plant pot with drainage.', 'Pots & Planters', '9.00', '8'],
  ['Hanging Basket', 'Woven basket for trailing plants.', 'Pots & Planters', '7.25', '12'],
  ['Garden Trowel', 'A sturdy hand tool for planting and weeding.', 'Gardening Tools', '8.75', '5'],
  ['Watering Can', 'A two-litre watering can for daily care.', 'Gardening Tools', '10.99', '7'],
  ['Organic Compost', 'Feed your vegetables naturally.', 'Fertilizers', '9.99', '30'],
  ['Liquid Fertilizer', 'Balanced feed for leafy growth.', 'Fertilizers', '6.75', '25'],
  ['Tomato Plant', 'Grow juicy tomatoes at home.', 'Herbs & Vegetables', '4.25', '20'],
  ['Basil Plant', 'Fresh basil for your kitchen.', 'Herbs & Vegetables', '3.50', '18'],
];

function seed(db) {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM products').get();
  if (existing.c > 0) {
    return;
  }

  let seller = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_SELLER_EMAIL);
  if (!seller) {
    const info = db.prepare(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    ).run('Demo Seller', DEMO_SELLER_EMAIL, '+15550000111', bcrypt.hashSync('password123', 10), 'SELLER');
    seller = { id: info.lastInsertRowid };
  }

  const insert = db.prepare(
    'INSERT INTO products (seller_id, name, description, category, price, stock) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const run = db.transaction(() => {
    for (const [name, description, category, price, stock] of DEMO_PRODUCTS) {
      insert.run(seller.id, name, description, category, Number(price), Number(stock));
    }
  });
  run();
}

module.exports = seed;