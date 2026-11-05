# CritterSitter (`crittersitter`)

A zero-login, mobile-first Pet Care Card application built with React 19, TypeScript, Tailwind CSS v4, Motion (`motion/react`), Express, and Google Maps Platform (`@vis.gl/react-google-maps`).

Designed for pet owners to create, customize, and share feeding, medication, walk, quirk, veterinary, emergency authorization, vaccination, and lost-pet flyer records with sitters via a 6-character Sitter Code, QR code, or offline snapshot—without requiring user accounts.

---

## Repository File Structure

```text
crittersitter/
├── index.html                           # Mobile-first HTML entry point & PWA meta tags
├── metadata.json                        # App metadata & capability declarations
├── package.json                         # Project dependencies & scripts ("crittersitter")
├── tsconfig.json                        # TypeScript configuration
├── vite.config.ts                       # Vite + Tailwind v4 + VitePWA configuration
├── server.ts                            # Express API server (6-char Sitter Codes, SHA-256 editToken, rate limiting)
├── .env.example                         # Environment variable template (VITE_GOOGLE_MAPS_API_KEY)
├── public/                              # Static PWA icons & manifest assets
│   ├── icon.svg
│   ├── apple-touch-icon.png
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── pwa-maskable-512x512.png
└── src/
    ├── main.tsx                         # React DOM root + Google Maps quota/auth listener
    ├── index.css                        # Tailwind CSS v4 + print styles + GPU wiggle animation
    ├── types.ts                         # Data models (PetProfile, VaccineRecord, WeightEntry, sanitization, PNG export)
    ├── App.tsx                          # Main 9-screen single-card mobile state machine & UI
    └── components/
        └── CrossStreetMapPicker.tsx     # Google Maps Places (New) autocomplete & interactive pin for Lost Pet Flyer
```

---

## Screen Flow & Architecture (For UI/UX Handoff)

All screens live inside a single `380px` mobile frame in `src/App.tsx` with 1-finger horizontal swipe navigation, spring physics (`stiffness: 300–420, damping: 24–28`), and hardware Back button synchronization:

1. **`role-select` ("Welcome")**:
   - Entry screen with **"I'm an Owner"** and **"I'm a Sitter"** buttons, plus a 1-tap **"Resume saved card"** button when a sitter has previously opened a code on their phone.
2. **`sitter-import` ("Enter sitter code")**:
   - 6-character alphanumeric code input (`GET /api/cards/:code`) with offline cache fallback.
3. **`start` ("The Paw")**:
   - Interactive 5-circle paw print layout (`152px` bottom main palm pad + four `80px` upper toe circles) with reserved top space for the app name and logo.
   - **Tap**: Opens a pet's care card directly if already named/pictured, or goes to `name-photo` for a new `+` slot.
   - **Slide / Drag**: Drag any circle in any order (including into/out of the large bottom paw pad) with live slot swapping and spring physics.
   - **Long-Press (Wiggle Mode)**: Reveals `-` delete badge and camera badge (only on slots that already have a pet name or photo).
4. **`name-photo` ("Pet name & picture")**:
   - First-time pet setup for name and circular photo (via live WebRTC camera viewfinder or photo gallery).
5. **`pet-cards` ("Pet cards")**:
   - Collapsible accordion sections for **Feeding**, **Meds**, **Walks**, **Quirks**, **Vet & Emergency** (including backup emergency contact and 1-tap copy from another household pet), and **Vaccines**.
   - Includes a 4-state cycling **Sex / Spay-Neuter** badge (`M-Neutered`, `M-Intact`, `F-Spayed`, `F-Intact`) and unit selector (`lbs` / `oz` with automatic `kg` conversion).
6. **`vet-visit` ("Vaccine & weight info")**:
   - Quick-reference view for vet appointments with vaccine expiration countdown badges and historical weight log.
7. **`lost-flyer` ("Lost pet flyer")**:
   - Printable / shareable red-bordered Lost Pet poster with **Google Maps Places (New) Cross-Street Autocomplete & Interactive Map Pin** (`CrossStreetMapPicker.tsx`), microchip number, owner phone, and a toggleable **"⚠️ DO NOT CHASE — CALL IMMEDIATELY"** banner.
8. **`share` ("Share")**:
   - Toggle which pets and care sections to include, generate/update/rotate the 6-character **Sitter Code**, display a scannable **QR Code** (`?code=XXXXXX`), export a high-res PNG card, or use plain-language phone backup (**"Save My Pets"** / **"Bring Back Pets"**).
9. **`sitter-view` ("What the sitter sees")**:
   - Displays a **collapsed list of pets by default** (showing pet photo, name, summary, and a chevron arrow).
   - Clicking the arrow expands that pet's full care card with spring animation, 1-tap Google Maps links for the Vet and After-Hours ER, and 1-tap `tel:` buttons (**Call Vet**, **Call Owner**, **Call Backup**).

---

## Running Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm start
```
