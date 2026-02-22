# 🛡️ SafePay Family — VS Code Setup Guide

## Folder Structure
```
safepay-final/
├── backend/        ← Node.js API
├── frontend/       ← Next.js UI
└── safepay-ml/     ← Python ML service
```

---

## ✅ Prerequisites — Install These First

1. **Node.js** → https://nodejs.org (download LTS version)
2. **Python 3.10+** → https://python.org/downloads
3. **PostgreSQL database** → Free at https://neon.tech
   - Sign up → Create project → Copy the connection string
   - Looks like: `postgresql://user:pass@ep-xxx.neon.tech/neondb`
4. **VS Code** → https://code.visualstudio.com
5. **VS Code Extension**: Install "**Split Terminal**" — you'll need 3 terminals open at once

---

## 🗄️ Step 1 — Set Up the Database

1. Go to https://neon.tech, sign up free
2. Create a new project called `safepay`
3. Copy the **connection string** — save it, you'll need it in Step 2

---

## ⚙️ Step 2 — Configure the Backend

1. Open the `backend/` folder
2. Find the file called `.env.example`
3. **Duplicate it** and rename the copy to `.env`
4. Open `.env` and fill in these values:

```
DATABASE_URL="paste-your-neon-connection-string-here"
JWT_SECRET="any-random-string-you-make-up-like-safepay-secret-abc123"
JWT_EXPIRES_IN="7d"
ML_SERVICE_URL="http://localhost:8001"
GEMINI_API_KEY="your-gemini-key-or-leave-blank"
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"
```

> **Gemini API key is optional.** The app works without it using fallback explanations.
> Get a free key at: https://aistudio.google.com/app/apikey

---

## 🖥️ Step 3 — Open VS Code

1. Open VS Code
2. **File → Open Folder** → select the `safepay-final` folder
3. Open the terminal: **View → Terminal** (or press `` Ctrl+` ``)
4. You need **3 separate terminals** — click the **+** button in the terminal panel 3 times

---

## Terminal 1 — Python ML Service

Click terminal 1 and run these commands **one at a time**:

```bash
cd safepay-ml
```
```bash
pip install fastapi uvicorn scikit-learn pandas numpy joblib
```
```bash
uvicorn app.api:app --port 8001 --reload
```

✅ You should see: `Uvicorn running on http://0.0.0.0:8001`

---

## Terminal 2 — Backend (Node.js)

Click terminal 2 and run these commands **one at a time**:

```bash
cd backend
```
```bash
npm install
```
```bash
npx prisma generate
```
```bash
npx prisma db push
```
```bash
node src/lib/seed.js
```
```bash
npm run dev
```

✅ You should see: `SafePay Backend running on port 4000`

> **`npx prisma db push`** creates all your database tables.
> **`node src/lib/seed.js`** adds demo accounts so you can log in.

---

## Terminal 3 — Frontend (Next.js)

Click terminal 3 and run these commands **one at a time**:

```bash
cd frontend
```
```bash
npm install
```
```bash
npm run dev
```

✅ You should see: `ready - started server on localhost:3000`

---

## 🚀 Open the App

Go to: **http://localhost:3000**

**Demo login accounts:**

| Role   | Email             | Password |
|--------|-------------------|----------|
| Senior | margaret@demo.com | demo1234 |
| Family | sarah@demo.com    | demo1234 |

---

## 🧪 How to Demo It

1. Open **two browser windows** side by side
2. Window 1 → login as `margaret@demo.com` (Senior)
3. Window 2 → login as `sarah@demo.com` (Family)
4. In the Senior dashboard → click **"+ Test Transaction"**
5. Enter: `$850`, merchant `CoinFlip ATM`, category `Gift Card/Crypto`
6. Hit **Submit** → you'll see a CRITICAL risk score fire
7. Watch the **Family dashboard update in real time** with the alert
8. Click **"🚫 Not Me — Block"** → both dashboards update instantly

---

## 🔴 Troubleshooting

**"Cannot find module" errors in backend**
→ Make sure you ran `npm install` inside the `backend/` folder, not the root

**"prisma: command not found"**
→ Use `npx prisma` instead of just `prisma`

**"Connection refused" on port 8001**
→ Make sure Terminal 1 (Python) is still running

**Database errors**
→ Double-check the `DATABASE_URL` in `backend/.env` — it must have no extra spaces

**Port already in use**
→ Something else is using that port. Run: `npx kill-port 3000 4000 8001`

**Windows users**
→ If `pip` doesn't work, try `pip3`
→ If `npm` commands fail, run VS Code as Administrator

---

## 📋 Every Time You Come Back

You don't need to reinstall — just open 3 terminals and run:

**Terminal 1:** `cd safepay-ml` → `uvicorn app.api:app --port 8001 --reload`

**Terminal 2:** `cd backend` → `npm run dev`

**Terminal 3:** `cd frontend` → `npm run dev`
