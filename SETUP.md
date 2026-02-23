# SchoolIT AI — Setup & Deployment Guide

## 1. Google Auth Setup

Authentication is already configured via NextAuth in `lib/auth.ts`. You just need to create OAuth credentials.

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services → Credentials**

### Step 2: Configure OAuth Consent Screen
1. Go to **OAuth consent screen**
2. Choose **External** as user type
3. Fill in:
   - App name: `SchoolIT AI`
   - User support email: your email
   - Authorized domains: `your-domain.vercel.app`
4. Add scopes: `email`, `profile`, `openid`
5. Save

### Step 3: Create OAuth Client ID
1. Go to **Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Authorized JavaScript origins:
   - `http://localhost:3000` (for local dev)
   - `https://your-app.vercel.app` (for production)
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/callback/google`
5. Copy the **Client ID** and **Client Secret**

### Step 4: Set Environment Variables
Create a `.env.local` file in the project root:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# NextAuth
NEXTAUTH_SECRET=generate-a-random-string-at-least-32-chars
NEXTAUTH_URL=http://localhost:3000

# Admin emails (comma-separated)
ADMIN_EMAILS=youremail@gmail.com,admin2@gmail.com

# GitHub Models AI token
GITHUB_TOKEN=your-github-personal-access-token
```

Generate `NEXTAUTH_SECRET` with:
```bash
openssl rand -base64 32
```

Get `GITHUB_TOKEN` from: https://github.com/settings/tokens
- Create a fine-grained token with **Models** read access

---

## 2. Vercel Deployment

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Update SchoolIT AI"
git push origin main
```

### Step 2: Connect to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click **New Project** → Import your GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Click **Deploy**

### Step 3: Set Environment Variables in Vercel
Go to **Project Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth client secret |
| `NEXTAUTH_SECRET` | Random 32+ char string |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `ADMIN_EMAILS` | Comma-separated admin emails |
| `GITHUB_TOKEN` | GitHub personal access token |

### Step 4: Update OAuth Redirect URIs
Once deployed, go back to Google Cloud Console and add your Vercel URL:
- Authorized origins: `https://your-app.vercel.app`
- Redirect URI: `https://your-app.vercel.app/api/auth/callback/google`

### Step 5: Redeploy
After setting env vars, redeploy from the Vercel dashboard or push a new commit.

### Auto-Deploy
Vercel automatically deploys on every push to `main`. The `vercel.json` config sets:
- Max function duration: 60 seconds (for AI API calls)
- All API routes use Node.js serverless functions

---

## 3. Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

Open http://localhost:3000

### Required Environment Variables for Local Dev
All variables listed in Step 4 of Google Auth Setup above must be in `.env.local`.

---

## 4. Project Structure

| Path | Purpose |
|---|---|
| `app/page.tsx` | Main chat page |
| `app/schedule/page.tsx` | Schedule manager page |
| `app/api/chat/route.ts` | Chat API with AI model fallback |
| `lib/auth.ts` | NextAuth Google OAuth config |
| `lib/server/tools.ts` | AI tool definitions (charts, search, etc.) |
| `components/ChatInterface.tsx` | Chat UI with rich content rendering |
| `components/MermaidRenderer.tsx` | Flowchart/diagram rendering |
| `components/ManimRenderer.tsx` | Math animation preview |
| `components/ImageRenderer.tsx` | Educational image generation |
