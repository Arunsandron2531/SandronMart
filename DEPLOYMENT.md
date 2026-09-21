# Deploying SANDRONMART to Render

This guide deploys SANDRONMART as a public **Node.js Web Service** on Render so it is reachable from
any laptop, PC, or mobile at a URL such as `https://sandronmart.onrender.com`.

---

## 1. Push the code to GitHub

Render deploys from a Git repository (GitHub / GitLab / Bitbucket).

```bash
git init
git add .
git commit -m "Prepare SANDRONMART for production"
# create an empty GitHub repository, then:
git remote add origin https://github.com/YOUR_USERNAME/sandronmart.git
git push -u origin main
```

> `node_modules/`, `data/` (the local SQLite file + auto-generated session secret) and `.env`
> are already gitignored, so no secrets or database files are committed.

- **`npm start`** starts the server: start command — Render reads the `start` script from `package.json`
  (`node server.js`). You can also type it explicitly (see step 5).
- **Node version** — `package.json` declares `engines.node >= 18`; Render will use a modern LTS (20/22).

---

## 2. Create the Web Service on Render

1. Go to <https://dashboard.render.com> and click **New → Web Service**.
2. Connect your GitHub account and select the **sandronmart** repository.
3. Render detects the Node environment automatically.

### Build Command

```
npm install
```

Render runs this during deployment. `better-sqlite3` ships prebuilt binaries for Linux on Node LTS;
if a native build is ever needed, Render's build environment includes the required compilers.

### Start Command

```
npm start
```

Equivalent to `node server.js`.

---

## 3. Add persistent storage (SQLite REQUIREMENT)

**SANDRONMART uses SQLite — it MUST live on persistent storage.**
A Render web service's normal filesystem is **ephemeral** (wiped on every deploy/restart). Without a
mounted disk, your SQLite file — and therefore all users, products, carts, and orders — would be lost.

> ⚠️ **Free-tier limitation:** Render **paid** (Starter and above) web services support mounted disks;
> **free** instances do **not** support disks and also sleep after inactivity. On the free tier, database
> and upload data will be lost when the instance is recycled/slept. For a production site that keeps data,
> use at least a paid Render instance with the mounted disk described below, or host somewhere that
> provides persistent disk / object storage on its free tier.

1. In the Render dashboard, open your web service and go to **Disks**.
2. **Add Disk**:
   - Mount Path: **`/var/data`**
   - Size: **1 GB** (plenty for SQLite)
3. The app is pointed at this disk with the `DB_PATH` environment variable below.

---

## 4. Required environment variables

Open **Environment** in the Render dashboard and add:

| Key             | Value                                                                | Why |
| --------------- | -------------------------------------------------------------------- | --- |
| `NODE_ENV`      | `production`                                                         | Enables `trust proxy` and **secure (HTTPS-only) session cookies**. |
| `SESSION_SECRET`| a long random string, e.g. `openssl rand -hex 48` output             | Signs session cookies. Required so sessions survive and cannot be forged. |
| `DB_PATH`       | `/var/data/sandronmart.db`                                           | Points SQLite at the mounted disk — **must match the disk mount path**. |
| `PORT`          | *(leave unset — Render injects this automatically)*                 | The app binds to `process.env.PORT`. |

Example `SESSION_SECRET` generation (run on your PC, not the server):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> Never hardcode `SESSION_SECRET` or passwords in the source. The demo seller account
> (`demo.seller@sandronmart.local` / `password123`) is seeded automatically only when the
> products table is empty and is intended for testing.

---

## 5. Port configuration

No hardcoding: the server uses `process.env.PORT || 3000` (`server.js`) and Render injects `PORT`
automatically. The public URL is `https://sandronmart.onrender.com` (you can rename it).

---

## 6. Static files, CSS, JS and EJS views

- Express serves `public/` automatically (`app.js`): `/css/style.css`, `/js/*.js`.
- Views are rendered server-side by EJS — no bundler needed.
- Routes use relative links, so everything works behind the Render URL.

---

## 7. Product images

SANDRONMART **does not upload files** — sellers enter a product **image URL** (an external link such
as `https://example.com/plant.jpg`), stored in `products.image_url`. Because images are remote URLs:

- ✅ No image upload code, temp upload folder, or object storage is required right now.
- ⚠️ If you later add real file uploads (multipart), they must be saved to the **mounted disk**
  (under `/var/data/uploads`) or to object storage (e.g. AWS S3 / Render Disks) — otherwise uploaded
  images would be lost on redeploy. Until then, nothing extra is needed.

---

## 8. Deploy & open the public URL

1. Click **Deploy** (or push a new commit to the repo — deployments are automatic).
2. When the deploy finishes, open: `https://sandronmart.onrender.com`
3. Optional: add a **Health Check Path** of `/health` in the Render settings (shown as *Example:
   `https://sandronmart.onrender.com/health`*, expects `{"status":"ok"}`).

---

## 9. Test from another PC / laptop / mobile

The Render URL works from any device on any network — no tunnel needed.

- Phone/laptop browser: open `https://sandronmart.onrender.com`.
- Quick API checks:
  - `GET /` → homepage
  - `GET /health` → `{"status":"ok"}`
  - Register → login → browse products → add to cart → checkout → place order → track it.
  - Seller: Manage Products (add a product), Orders (advance status).

First deployment can take a few minutes (dependency install + service start) and Render free tiers
may sleep after inactivity (first request after sleep takes ~30–60 s to wake).

---

## 10. Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Sessions / login reset after redeploy | Set `SESSION_SECRET` (and keep the mounted disk for `data/`). |
| "no such table" or empty DB after restart | `DB_PATH` must point inside the mounted disk (`/var/data/...`); verify the mount in the Render dashboard. |
| Login fails with SecureSameSite / cookie issues | Ensure `NODE_ENV=production` (secure cookies) and connections go over `https://`. |
| Port already in use | `PORT` is injected by Render; do not set it manually. |
| better-sqlite3 build error | Ensure Node LTS (20/22) is selected under **Environment**; prebuilt binaries are used for these. |

---

## Summary checklist

- [ ] Repository pushed to GitHub (no `.env`, `node_modules/`, or `data/` committed)
- [ ] Web Service created, Build = `npm install`, Start = `npm start`
- [ ] Disk mounted at `/var/data`
- [ ] Env: `NODE_ENV=production`, `SESSION_SECRET=<random>`, `DB_PATH=/var/data/sandronmart.db`
- [ ] Deployed and opening at `https://sandronmart.onrender.com`