# CodeClip — Secure Online Clipboard

A fast, secure temporary clipboard for sharing text and files. Create a clip, share the 4-digit code or QR, and it's gone when the time's up.

## Features

- **Text & File Sharing** — paste text, drop files/folders, or paste screenshots (10MB per file, 50MB total)
- **Flexible Expiry** — 10 minutes, 1 hour, 1 day or 7 days
- **Self-destruct** — optional burn-after-read: only the first visitor can open the clip
- **Password Protection** — optional per-clip password (scrypt-hashed)
- **Creator Controls** — the creating browser gets a private owner token to edit the text or delete the clip/files; nobody else can
- **View Counter** — see how many times a clip was opened and when
- **Syntax Highlighting** — Markdown preview, a highlighted Code view, and highlighted text-file previews
- **QR Code & Share Sheet** — scan or natively share the clip link
- **Image Lightbox** — full-screen image previews
- **Keyboard Shortcuts** — `Ctrl/⌘ + Enter` creates a clip, `/` jumps to the access code
- **AES-256-GCM Encryption** — text content is encrypted before being stored
- **Abuse Protection** — MongoDB-backed rate limits shared across serverless instances, with a strict cap on wrong code guesses
- **Auto Cleanup** — a daily cron purges expired clips, their files, and any orphaned uploads
- **Dark / Light Theme** — system-aware with manual toggle

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | MongoDB Atlas (Mongoose) |
| File Storage | Cloudinary (all file types) |
| Encryption | Node `crypto` (AES-256-GCM, scrypt) |
| UI | shadcn/ui + Tailwind CSS 4 |
| Scheduling | Vercel Cron Jobs |
| Language | TypeScript |
| Package Manager | pnpm |

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/Himanshu-Khairnar/CodeClip.git
cd CodeClip
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root:

```env
MONGODB_URI=your_mongodb_connection_string
CRON_SECRET=your_random_secret_string
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
ENCRYPTION_KEY=a_long_random_hex_string
```

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string (Atlas or local) |
| `CRON_SECRET` | Secret token to authorize the `/api/cleanup` cron endpoint |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name from the dashboard |
| `CLOUDINARY_API_KEY` | API key from [cloudinary.com](https://cloudinary.com) dashboard |
| `CLOUDINARY_API_SECRET` | API secret from [cloudinary.com](https://cloudinary.com) dashboard |
| `ENCRYPTION_KEY` | Secret used to encrypt clip text and pepper code hashes. Never change it once clips exist |
| `MONGODB_DNS_SERVERS` | *(optional)* Comma-separated DNS resolvers for Atlas SRV lookups. Defaults to public resolvers locally, system DNS on Vercel |

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/clip/sign` | POST | Sign one direct browser → Cloudinary upload |
| `/api/clip/create` | POST | Create a clip; returns `code` and a private `ownerToken` |
| `/api/clip/[code]` | GET | Fetch a clip (`x-clip-password` header for protected clips) |
| `/api/clip/[code]` | PATCH | Edit the clip text — requires `x-owner-token` |
| `/api/clip/[code]` | DELETE | Delete a clip and its files — requires `x-owner-token` |
| `/api/clip/[code]/file` | DELETE | Remove one file — requires `x-owner-token` |
| `/api/clip/[code]/zip` | GET | Download all files as a ZIP |
| `/api/download` | GET | Download proxy (this app's Cloudinary files only) |
| `/api/cleanup` | GET | Delete expired clips, their files, and orphaned uploads (daily cron) |

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add environment variables in **Project Settings → Environment Variables**:
   - `MONGODB_URI`
   - `CRON_SECRET`
   - `CLOUDINARY_CLOUD_NAME` — from [cloudinary.com](https://cloudinary.com) → Settings → API Keys
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `ENCRYPTION_KEY`
4. Deploy — Vercel will automatically run the cleanup cron once daily via `vercel.json`

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── cleanup/        # Cron cleanup endpoint
│   │   └── clip/           # Clip CRUD + direct Cloudinary signing
│   ├── clip/[code]/        # Clip viewer page
│   └── page.tsx            # Home (create + access tabs)
├── components/
│   ├── theme-toggle.tsx
│   └── ui/                 # shadcn components
├── lib/
│   ├── cloudinary.ts       # Cloudinary upload/delete helpers
│   ├── db.ts               # MongoDB connection
│   ├── clip-auth.ts        # Owner token / password / burn-after-read checks
│   ├── encryption.ts       # AES-GCM, code hashing, password hashing
│   ├── history.ts          # Local (per-device) clip history + owner tokens
│   └── rate-limit.ts       # MongoDB-backed rate limiter
├── models/
│   ├── Clip.ts             # Clip schema
│   └── RateLimit.ts        # Rate-limit counters (TTL-indexed)
└── vercel.json             # Cron job config
```

## License

MIT
