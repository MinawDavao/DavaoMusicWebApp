# MINAW DVO — Davao Music & Live Scene

A mobile-first music platform for Davao City and Southern Mindanao: discover local bands, stream their music, find gigs, connect with fans, and buy, sell or trade gear.

## Repository layout

| Path | What it is |
| --- | --- |
| `src/` | The React + TypeScript app (Vite, Tailwind CSS v4, lucide-react, Supabase) |
| `supabase/` | Database migrations (tables, security rules, storage) |
| `public/` | Static assets (logo) |
| `design/` | Screen designs from Claude Design (see below) |

## Running the app

Requires Node.js 18+.

```bash
npm install
cp .env.example .env.local   # optional: add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint` (type-check).

## How the app is wired

- **Supabase** handles accounts, data and file storage (`src/lib/supabase.ts`). The project URL and publishable key are built in and can be overridden with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Flow:** Sign Up (Fan or Artist) → Terms of Agreement → Profile setup (artists create a band page and upload up to 3 songs) → app.
- **Testing mode:** sign-ups are auto-confirmed by a database trigger (`private.auto_confirm_email`). Remove it before launch.
- **Screens** (`src/screens/`): Home, Audio, Band page, Connect feed (posts, comments, reactions, Report), Profile, Deals (search, filters, Post a Deal), Auth, Onboarding.
- **Sponsored Spotlight** content is static in `src/data/sponsors.ts` until an admin panel exists.

## Design files (`design/`)

Phone screens (390 px wide) designed on the Claude Design canvas. They are the target for the next round of app work and are **not yet built into `src/`**.

| File | Screen |
| --- | --- |
| `Main.dc.html` | Home — featured bands, Top 10, sponsored deals, upcoming gigs |
| `Audio.dc.html` | Audio & Bands — search, genre filter, DVO Scene Radio, Top 10 |
| `BandProfile.dc.html` | Band page with Edit Profile and artist profile menu (Log Out) |
| `Connect.dc.html` | Community feed with a **Report** button on every post |
| `FanProfile.dc.html` | Fan profile with Edit Profile and profile menu (Log Out) |
| `Deals.dc.html` | Gear Exchange with search, filters and **Post a Deal** |
| `Login.dc.html` | Log In / Sign Up flow |
| `SignUp.dc.html` | Same flow, opening on Sign Up (email verification bypassed for testing) |
| `Terms.dc.html` | Terms of Agreement step (music copyright & downloads, no nudity/violence/political posts, review & removal) |
| `SetupArtist.dc.html` | Profile setup after sign-up (Fan / Artist toggle, artist uploads limited to 3 tracks) |
| `canvas.json` | Canvas layout and artboard sizes |

The `.dc.html` files use the Claude Design component format and load a `support.js` runtime provided by the canvas, so open them in Claude Design rather than directly in a browser. Photos are placeholders.

### Sign-up flow (designed)

Sign Up → Terms of Agreement → Email verification (currently bypassed for testing) → Profile setup (Fan or Artist) → Done.

> The Terms of Agreement text is a starting draft, not legal advice. Fill in `[SUPPORT EMAIL]` and have it reviewed before launch.
