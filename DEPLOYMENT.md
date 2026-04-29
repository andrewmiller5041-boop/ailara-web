# AILARA — Deployment Guide

## What's in this folder

```
ailara-web/
├── index.html          ← App entry point (PWA shell)
├── wellness-agent.jsx  ← Your full React app
├── manifest.json       ← PWA manifest (icons, name, shortcuts)
├── sw.js               ← Service worker (offline + installable)
├── vercel.json         ← Vercel routing + security headers
├── api/
│   └── chat.js         ← Serverless proxy (keeps API key safe)
├── icons/              ← CREATE THESE (see Icons section below)
└── README.md           ← This file
```

---

## Step 1 — Create your app icons

You need icons in multiple sizes. Use https://appicon.co

1. Go to https://appicon.co
2. Upload a 1024×1024 PNG of your AILARA logo
   (simple green "A" on dark background works great)
3. Select "iPhone" + "Android"
4. Download and place the files in an `icons/` folder:
   - icon-72.png, icon-96.png, icon-128.png
   - icon-144.png, icon-152.png, icon-167.png
   - icon-180.png, icon-192.png, icon-512.png

---

## Step 2 — Set up Stripe payments

1. Create a free account at https://stripe.com
2. Go to **Products → Add Product** and create:
   - "AILARA Pro" — $7.99/month recurring
   - "AILARA Elite" — $14.99/month recurring
   - "AILARA Pro Annual" — $63.99/year recurring
   - "AILARA Elite Annual" — $119.99/year recurring
3. For each, create a **Payment Link** (Stripe dashboard → Payment Links)
4. Copy each payment link URL
5. In wellness-agent.jsx, find `const STRIPE_LINKS` and paste your links:

```javascript
const STRIPE_LINKS = {
  pro_monthly:    "https://buy.stripe.com/YOUR_PRO_MONTHLY_LINK",
  pro_annual:     "https://buy.stripe.com/YOUR_PRO_ANNUAL_LINK",
  elite_monthly:  "https://buy.stripe.com/YOUR_ELITE_MONTHLY_LINK",
  elite_annual:   "https://buy.stripe.com/YOUR_ELITE_ANNUAL_LINK",
};
```

6. In Stripe, set the **Success URL** for each payment link to:
   `https://your-app.vercel.app/?upgraded=true&tier=pro`
   (the app reads this and unlocks Pro/Elite automatically)

---

## Step 3 — Deploy to Vercel

1. Create a free account at https://vercel.com
2. Install Vercel CLI: `npm install -g vercel`
3. In this folder, run: `vercel`
4. Follow the prompts — select "No" for existing project
5. Your app deploys to `https://ailara-xxx.vercel.app`

**Set your API key:**
- In Vercel dashboard → your project → Settings → Environment Variables
- Add: `ANTHROPIC_API_KEY` = your `sk-ant-...` key

**Update the proxy with your domain:**
- Open `api/chat.js`
- Replace `https://ailara.vercel.app` with your actual Vercel URL in ALLOWED_ORIGINS

**Update the app to use the proxy:**
- Open `wellness-agent.jsx`
- Find `const PROXY_URL = null;`
- Change to: `const PROXY_URL = "https://your-app.vercel.app/api/chat";`

6. Redeploy: `vercel --prod`

---

## Step 4 — Custom domain (optional but recommended)

Domain names like `ailara.app` or `getailara.com` cost ~$12/year.

1. Buy a domain at https://namecheap.com or https://domains.google
2. In Vercel dashboard → your project → Settings → Domains
3. Add your domain and follow the DNS instructions

---

## Step 5 — Tell users how to install on iPhone

Since you're not in the App Store, users install via Safari:

1. Open your website in Safari on iPhone
2. Tap the Share button (box with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

The app appears on their home screen exactly like a native app.

**Tip:** Add an install prompt banner in the app UI. The code in
wellness-agent.jsx already shows this on mobile Safari.

---

## Post-launch checklist

- [ ] Icons created and in /icons/ folder
- [ ] Stripe payment links set up
- [ ] PROXY_URL updated in wellness-agent.jsx
- [ ] ANTHROPIC_API_KEY set in Vercel environment variables
- [ ] ALLOWED_ORIGINS updated in api/chat.js
- [ ] Custom domain set up
- [ ] Tested on iPhone Safari
- [ ] "Add to Home Screen" works correctly
- [ ] Payments tested with Stripe test mode

---

## Privacy Policy (required for Stripe)

You need a privacy policy page. Use https://privacypolicygenerator.info
to generate one. Host it at `your-app.vercel.app/privacy`.

Create `/privacy.html` with the generated content and it deploys automatically.

---

## Costs at scale

| Monthly active users | Estimated API cost | Estimated revenue (5% Elite) |
|---------------------|-------------------|-------------------------------|
| 100                 | ~$50              | ~$65                          |
| 1,000               | ~$500             | ~$650                         |
| 10,000              | ~$5,000           | ~$6,500                       |

