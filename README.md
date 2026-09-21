# SANDRONMART

**Plants & Gardening E-Commerce Marketplace** — a full-stack marketplace where buyers can browse plants and gardening supplies, manage carts, and place orders, and sellers can list products and manage incoming orders.

Built with **Node.js, Express, EJS, SQLite (better-sqlite3)**, plain **HTML/CSS/JavaScript**, **bcryptjs** and **express-session**.

> All prices are in Indian Rupees (₹). Includes Indian delivery addresses, time slots, COD/UPI/Card mock payments, order tracking, and seller order management.

---

## Features

- Buyer & seller accounts (register, login, logout, protected dashboards)
- Product catalog with search and category filters
- Cart with quantity controls and stock limits
- Checkout with delivery address (Indian format + pincode validation), delivery time slots, and mock payment methods
- Order confirmation, My Orders, order details, delivery tracking timeline
- Seller product management and incoming-order status updates
- Dynamic delivery-date calculation (3–7 day window from the current date, snapshotted per order)
- INR formatting via `Intl.NumberFormat('en-IN')`

---

## Local development

Requires **Node.js 18 or newer**.

```bash
# 1. Install dependencies
npm install

# 2. Start the app
npm start
```

Open <http://localhost:3000>.

The first start creates `data/sandronmart.db` and seeds a demo seller catalog (seeding only happens when the products table is empty — existing data is never wiped).

### Demo account

| Role   | Email | Password |
| ------ | ----- | -------- |
| Seller | `demo.seller@sandronmart.local` | `password123` |

### Tests

```bash
npm test
```

---

## Configuration (environment variables)

| Variable        | Required in production | Purpose |
| --------------- | ---------------------- | ------- |
| `PORT`          | auto-injected by Render | HTTP port the server binds to |
| `NODE_ENV`      | yes (`production`)      | enables HTTPS secure cookies + proxy trust |
| `SESSION_SECRET`| yes                     | session cookie signing secret (long random string) |
| `DB_PATH`       | yes                     | absolute path of the SQLite file on the persistent disk |
| `DB_PATH` (local)| no                    | defaults to `data/sandronmart.db` |

See `.env.example`. Never commit secrets to the repository (`.env` and `data/` are gitignored).

---

## Deployment (production)

Full step-by-step instructions for deploying to **Render** as a Node.js web service are in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Key points:

- The app reads `PORT` from the platform — no hardcoded host/port.
- SQLite needs a **persistent disk** (Render Mounted Disk); `DB_PATH` must point inside it.
  (Render free instances do not support disks — use a paid instance for persistence.)
- Product images are **remote URLs** (no file uploads), so no extra object storage is required today.
  Products without an image automatically show **category-based default images** stored locally in
  `public/assets/images/products/` (served as static files everywhere — localhost, GitHub, Render).
- Session cookies are `secure` only when `NODE_ENV=production`; sessions are stored in SQLite.

---

## Project structure

```
config/    shop config, DB schema + connection, seed data
routes/    auth, pages, buyer, seller products, cart, orders
views/     EJS templates (buyer/seller/partials)
public/    static CSS & JS
utils/     currency, delivery-date, validators
middlewares/auth.js   role-based route guards
test/      smoke test suite
```