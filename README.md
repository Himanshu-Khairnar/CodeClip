# CodeClip — Secure Online Clipboard

A fast, secure temporary clipboard for sharing text and files. Create a clip, share the 6-character code or QR, and it's gone when the time's up.

## Features

- **Text & File Sharing** — paste text or upload any file type (up to 30MB total)
- **Password Protection** — optionally lock a clip behind a password
- **One-Time View** — clip auto-deletes after the first access
- **QR Code** — scan to open the clip on any device
- **AES Encryption** — text content is encrypted before being stored
- **Auto Cleanup** — server-side cron runs daily to purge stale clips and their files from storage
- **Dark / Light Theme** — system-aware with manual toggle

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | MongoDB Atlas (Mongoose) |
| File Storage | Cloudinary (all file types) |
| Encryption | CryptoJS (AES) |
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

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/clip/create` | POST | Create a new clip (text + files) |
| `/api/clip/[code]` | GET | Fetch a clip by its code |
| `/api/clip/[code]` | DELETE | Delete a clip and its files |
| `/api/clip/[code]/verify` | POST | Verify password for a protected clip |
| `/api/cleanup` | GET | Delete all clips older than 2 minutes (cron) |

## Deployment (Vercel)

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add environment variables in **Project Settings → Environment Variables**:
   - `MONGODB_URI`
   - `CRON_SECRET`
   - `CLOUDINARY_CLOUD_NAME` — from [cloudinary.com](https://cloudinary.com) → Settings → API Keys
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
4. Deploy — Vercel will automatically run the cleanup cron once daily via `vercel.json`

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── cleanup/        # Cron cleanup endpoint
│   │   └── clip/           # Clip CRUD + password verify
│   ├── clip/[code]/        # Clip viewer page
│   └── page.tsx            # Home (create + access tabs)
├── components/
│   ├── theme-toggle.tsx
│   └── ui/                 # shadcn components
├── lib/
│   ├── cloudinary.ts       # Cloudinary upload/delete helpers
│   ├── db.ts               # MongoDB connection
│   └── encryption.ts       # AES encrypt/decrypt
├── models/
│   └── Clip.ts             # Mongoose schema
└── vercel.json             # Cron job config
```

## License

MIT
