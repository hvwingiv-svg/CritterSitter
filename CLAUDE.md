# CritterSitter — Pet Care Card

Mobile-first, zero-account app: pet owners build a care card (feeding, meds, walks,
quirks, vet/ER, vaccines, lost-pet flyer) and share it with a sitter via a
6-character Sitter Code or a PNG export. Development moved here from Google AI
Studio; this repo is now the source of truth — do not assume AI Studio is in sync.

## Commands

- `npm install` — install (bun also works; keep `package.json` npm-resolvable)
- `npm run dev` — Express + Vite dev server on http://localhost:3000
- `npm run lint` — `tsc --noEmit`; must pass before committing
- `npm run build` — production build to `dist/` (includes PWA service worker)
- `NODE_ENV=production npm start` — serve `dist/` + API

## Layout

- `src/App.tsx` — the whole UI: a 9-screen state machine (`ScreenId`) inside one
  380px card frame. Screens: role-select, sitter-import, start ("The Paw"),
  name-photo, pet-cards, vet-visit, lost-flyer, share, sitter-view.
- `src/types.ts` — data model (`PetProfile`, `SharedSnapshot`, …), sanitization,
  PNG card export. Server and client sanitization must stay in agreement.
- `src/components/CrossStreetMapPicker.tsx` — Google Maps Places picker for the
  lost-pet flyer (needs `VITE_GOOGLE_MAPS_API_KEY`; app must degrade without it).
- `server.ts` — Express: `POST /api/cards` (create/update, guarded by a hashed
  `editToken`), `GET /api/cards/:code` (read-only), rate limiting, in-memory Map
  persisted to `.sitter-codes.json`.
- `.aistudio/` — leftover AI Studio planning notes; reference only.

## Product rules (non-negotiable)

- No accounts, sign-up, email or passwords. Owner data lives in `localStorage`.
- Radical minimalism: each screen has one job. Push back on feeds, chat,
  dashboards or other feature creep.
- One universal card; owners toggle sections on the Share screen.
- Sitters are read-only and get 1-tap Call Vet / Call Owner.
- Mobile ergonomics: swipe navigation synced with the hardware Back button,
  Enter dismisses the keyboard, spring animations via `motion/react`.

## Visual identity

- App background `#161616`; card surface `#f7f8f7`, 28px radius.
- Accent emerald `#0d5c46` (hover `#0a4836`); emergency red `#e12d2d`/`#dc2626`;
  amber callouts for emergency spending authorization.
- Fonts: Plus Jakarta Sans (UI), JetBrains Mono (codes, phones, chip IDs, dates).
- Icons: `lucide-react`. Styling: Tailwind CSS v4.

## Notes

- `@google/genai` is a dependency but is not used anywhere yet.
- Verify UI changes by running the dev server and driving it with Playwright at
  a 390×844 viewport.
