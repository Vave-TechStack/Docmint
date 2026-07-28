# Google OAuth Setup Guide for DocMint

This guide walks you through enabling **Google Login** on your DocMint application using NextAuth.js.

---

## 📋 Prerequisites

- A **Google Cloud** account (free — no credit card required for OAuth)
- Your DocMint app running locally or on a server

---

## 🚀 Step-by-Step Setup (5 minutes)

### 1. Open Google Cloud Console

Go to: **[https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)**

- If you don't have a project, click **Create Project** → name it `DocMint` → **Create**
- Select your project from the top dropdown

### 2. Configure OAuth Consent Screen

1. Click **OAuth consent screen** (left sidebar)
2. Choose **External** → **Create**
3. Fill in:
   - **App name**: `DocMint`
   - **User support email**: your email
   - **Developer contact info**: your email
4. Click **Save and Continue**
5. **Scopes**: Skip (click **Save and Continue**)
6. **Test users**: Click **Add Users** → add your email → **Save and Continue**
7. Back to **Credentials**

### 3. Create OAuth 2.0 Client ID

1. Click **Create Credentials** → **OAuth client ID**
2. **Application type**: **Web application**
3. **Name**: `DocMint Web`
4. Under **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local development)
   - `https://your-production-domain.com` (when deployed)
5. Under **Authorized redirect URIs** — **Add this EXACT URL**:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   > ⚠️ This is **critical** — NextAuth needs this URL exactly. A single character mismatch will cause a `redirect_uri_mismatch` error.

   For production, also add:
   ```
   https://your-production-domain.com/api/auth/callback/google
   ```
6. Click **Create**

### 4. Copy Your Credentials

A popup will show:

| Field | What to copy |
|-------|-------------|
| **Client ID** | Copy this long string — looks like `123456789-abc123.apps.googleusercontent.com` |
| **Client Secret** | Copy this secret — click the copy icon |

> 🔒 Keep the **Client Secret** secure. Never commit it to git.

### 5. Configure DocMint `.env`

Run the setup script:

```bash
cd docmint
python scripts/setup-google-oauth.py \
  --client-id "YOUR_CLIENT_ID" \
  --client-secret "YOUR_CLIENT_SECRET"
```

Or manually edit `.env`:

```env
# ─── Google OAuth (NextAuth.js) ───
# 1. Go to https://console.cloud.google.com/apis/credentials
# 2. Create OAuth 2.0 Client ID (Web application)
# 3. Add Authorized redirect URI:
#    http://localhost:3000/api/auth/callback/google
# 4. Copy the Client ID and Client Secret below
GOOGLE_CLIENT_ID="YOUR_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
```

### 6. Verify It Works

1. Restart your Next.js dev server
2. Open **http://localhost:3000/login**
3. You should see the **Google** button
4. Click it → you'll be redirected to Google's consent screen
5. Select your Google account → **Continue**
6. You'll be redirected back to DocMint → **Dashboard** 🎉

---

## 🔄 How It Works (Behind the Scenes)

```
User clicks "Google" button
        │
        ▼
NextAuth redirects to:
  https://accounts.google.com/o/oauth2/auth
        │
        ▼
User authorizes in Google
        │
        ▼
Google redirects to:
  /api/auth/callback/google?code=...
        │
        ▼
NextAuth exchanges code for tokens
        │
        ▼
signIn callback checks if email exists
        │
   ┌────┴────┐
   ▼         ▼
Exists?   New user?
   │         │
   ▼         ▼
Update     Create user
profile    in DB (auto-register)
   │         │
   └────┬────┘
        ▼
JWT created → Session established
        │
        ▼
Redirected to /dashboard
```

### Key Behaviors

| Scenario | What happens |
|----------|-------------|
| **New user** — emails match? | User is auto-registered and logged in |
| **Existing user** — same email? | Profile (name/image) is updated, linked to Google account |
| **Different email** — not registered? | A new DocMint account is created |
| **Error** — invalid token? | Redirected back to `/login` with error |

---

## 🧪 Testing Tips

### Check if Google OAuth is Active

Run the validation script:

```bash
python scripts/setup-google-oauth.py
```

You'll see:
```
  Provider:      ✅ Active (or ⏸️ Inactive)
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri_mismatch` | Callback URL in Google Cloud doesn't match | Check `/api/auth/callback/google` is exact |
| `access_denied` | User cancelled | Normal — user clicked "Cancel" |
| `id_token validation failed` | Wrong client secret | Re-check your `.env` value |
| `400: invalid_request` | Missing required scope | Re-check OAuth consent screen config |
| 404 on `/api/auth/callback/google` | NextAuth route not mounted | Ensure `app/api/auth/[...nextauth]/route.ts` exists |

---

## 🌐 Production Deployment

When deploying to production, update **both** places:

### 1. Google Cloud Console

Add to **Authorized redirect URIs**:
```
https://your-domain.com/api/auth/callback/google
```

### 2. DocMint `.env`

Update the URLs:
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
AUTH_URL=https://your-domain.com
```

Prod tip: Enable the **Google Cloud OAuth consent screen** from **Testing** → **In production** (requires app verification for 100+ users).

---

## 🔐 Security Notes

- The Google OAuth **Client Secret** is hashed and never exposed to the browser
- NextAuth uses `code` flow (not implicit) — secure token exchange server-side
- `allowDangerousEmailAccountLinking: true` enables account linking by verified email
- All OAuth users get a JWT session (no database sessions stored)
- No Google access/refresh tokens are stored — we only use the identity token

---

## 📚 References

- [NextAuth.js Google Provider Docs](https://next-auth.js.org/providers/google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [NextAuth.js Configuration](https://next-auth.js.org/configuration/options)
