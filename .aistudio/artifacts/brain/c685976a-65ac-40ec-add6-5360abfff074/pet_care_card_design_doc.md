# Pet Care Card — Design Document & AI Brainstorming Scaffold

> **How to use this document:** Copy and paste everything below the line into any AI chat (ChatGPT, Claude, Gemini, etc.) to get tailored, high-signal feature ideas that respect your app's minimalist, zero-account architecture.

---

## COPY-PASTE PROMPT START

I am building a consumer mobile app (packaged as a Google Play Store Android APK and mobile web app) called **Pet Care Card**. 

Below is the complete Design Document and Technical Scaffold of the app as it exists right now. Please read the entire specification carefully—especially the **Core Philosophy & Non-Negotiable Constraints**—and then answer the brainstorming questions at the bottom.

---

### 1. Core Product Philosophy & Non-Negotiable Constraints
1. **Zero Accounts / No Sign-Up Ever**: Users never create an account, enter an email, or set a password.
2. **Radical Minimalism (Anti-Feature-Creep)**: Every screen has one clear job. No cluttered dashboards, no social feeds, no chat rooms, no bloat.
3. **Local-First + Ephemeral Sitter Codes**:
   - Pet owners store and edit all their pet profiles locally on their phone (`localStorage`).
   - To share with a pet sitter, dog walker, or family member, the owner taps **Generate Sitter Code** to get a 6-character alphanumeric code (e.g., `7K4M9P`) backed by a lightweight Express store, or exports a high-resolution `1080px` PNG image.
   - Sitters open the app, tap **"I'm a Sitter"**, enter the 6-character code, and immediately view the finished card with 1-tap **Call Vet** and **Call Owner** buttons.
4. **One Universal Card**: There are no complicated role presets—just one clean card with simple checkboxes letting the owner toggle which sections to include before sharing.
5. **Tactile Mobile Ergonomics**:
   - Single-screen mobile card frame (`max-width: 380px`, `min-height: 680px`).
   - 1-finger horizontal swipe navigation (left/right) synced with Android hardware Back button (`popstate`) and top/bottom pill navigation arrows.
   - Pressing `Return` / `Enter` in any text input or textarea immediately dismisses the mobile keyboard.
   - Spring-physics animations (`motion/react`) for page slides, accordions, and buttons.

---

### 2. Visual Identity & Design System
- **Outer App Background**: Deep matte charcoal (`#161616`)
- **Card Surface**: Warm off-white (`#f7f8f7`) with `28px` rounded corners
- **Primary Brand Accent**: Deep Emerald Green (`#0d5c46`, hover `#0a4836`)
- **Destructive / Emergency Accent**: High-contrast Red (`#e12d2d` / `#dc2626`)
- **Warning Callout Surface**: Warm Amber (`bg-amber-50/80`, `border-amber-200/80`) for emergency veterinary spending authorization
- **Typography**:
  - `Plus Jakarta Sans` for UI headers, labels, and instructions
  - `JetBrains Mono` for sitter codes, phone numbers, microchip IDs, weights, and vaccine dates

---

### 3. Screen-by-Screen Architecture (Current Flow)

1. **`role-select` ("Welcome")**
   - Two large tactile cards:
     - **"I'm an Owner"** → Advances to `start`
     - **"I'm a Sitter"** → Advances to `sitter-import`

2. **`sitter-import` ("Enter sitter code")**
   - 6-character uppercase monospace input (`E.G. 7K4M9P`).
   - Fetches the card snapshot from `GET /api/cards/:code` and transitions straight to `sitter-view`.

3. **`start` ("Add a pet")**
   - Displays up to 5 circular pet slots (`76px` diameter) arranged in a radial geometric pattern around the center of the card.
   - **Tap a circle**: Selects that pet slot and advances to `name-photo`.
   - **Long-press any circle (420ms)**: Enters iOS-style **Wiggle Mode** (`.animate-wiggle`):
     - Red `-` badge (`top-left`) removes a circle slot.
     - Emerald camera badge (`top-right`) appears on already-added pets so the owner can snap/change a photo directly from the start screen without advancing.
     - Translucent ghost `+` circle appears if fewer than 5 circles exist, allowing the owner to add slots back up to 5.

4. **`name-photo` ("Pet name & picture")**
   - Large centered circular avatar button (`112px`) + centered pet name input.
   - Tapping the photo button opens a spring-animated bottom sheet:
     - **"Take a photo now"** (opens an in-app circular live camera viewfinder with front/back camera flip and center shutter button, resizing snapshots to `320px` JPEG).
     - **"Choose from gallery"** (opens device photo picker).

5. **`pet-cards` ("Pet cards" — Unified Card + Editor)**
   - **Top Pet Header Card**: Photo avatar, Pet Name, Age, Breed, and Weight input with inline `lbs` / `oz` unit selector.
   - **Household Pet Switcher**: Pill buttons to switch between multiple pets if more than one circle slot is filled.
   - **Collapsible Spring Accordions** (Feeding is open by default; others collapsed):
     1. **Feeding**: Schedule, portion sizes, allergies.
     2. **Meds**: Medications, dosages, administration notes.
     3. **Walks**: Schedule, harness/leash notes, reactivity/triggers.
     4. **Quirks**: Habits, fears, calming routines.
     5. **Vet & Emergency Info**: Clinic name, Vet phone, After-hours ER hospital, Owner phone, Microchip number, Emergency `$` spending authorization note, and a button to open **Lost Pet Flyer**.
     6. **Vaccine & Weight Info**: Summary of logged vaccines and weight entries, with a button to open the full **Vaccine & Weight Info** screen (`vet-visit`).

6. **`vet-visit` ("Vaccine & weight info")**
   - **Vaccines**: Add/remove vaccines with `name`, `dateGiven`, and `expiresAt`. Automatically calculates and displays color-coded expiration badges (`Expired`, `Expiring in Xd`, or `Valid`).
   - **Weight History**: Log dated weight entries with `lbs` / `oz` selector.

7. **`lost-flyer` ("Lost pet flyer")**
   - High-contrast red-bordered `LOST PET` flyer editable in-place (photo, name, age, breed, weight + `lbs`/`oz`, identifying quirks/collar notes, microchip number, and owner phone).
   - 1-tap **Print / Save PDF** button (`window.print()` with `@media print` rules that hide all app chrome).

8. **`share` ("Share")**
   - **Pets on this card**: Multi-select pills to include one or several household pets on the same shared card.
   - **What to include**: Checkboxes for `Feeding`, `Meds`, `Walks`, `Quirks`, `Vet & after-hours ER`, `If something's wrong ($ auth)`, and `Vaccine records attached`.
   - **Generate / Update Sitter Code**: Calls `POST /api/cards` to create or update the owner's 6-character Sitter Code, auto-copies it, and supports native mobile share sheets (`navigator.share`).
   - **Save Image**: Renders a crisp `1080px`-wide PNG card via HTML5 Canvas (`exportCardAsImage`) for texting/WhatsApp/printing.

9. **`sitter-view` ("What the sitter sees")**
   - Displays the clean, high-contrast care card for all shared pets.
   - **When opened by a Sitter (via Sitter Code)**: Strictly read-only with prominent 1-tap `tel:` buttons (**Call Vet** and **Call Owner**) and a print/download button.
   - **When previewed by the Owner**: Every field remains editable in-place.

---

### 4. Current Data Schema (`src/types.ts`)

```typescript
export type WeightUnit = 'lbs' | 'oz';

export interface VaccineRecord {
  id: string;
  name: string;
  dateGiven: string; // YYYY-MM-DD
  expiresAt: string; // YYYY-MM-DD
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightLbs: string;
  weightUnit?: WeightUnit;
}

export interface PetProfile {
  slotIndex: number;
  name: string;
  photoUrl: string; // 320px base64 JPEG/PNG/WebP data URL
  age: string;
  breed: string;
  weightLbs: string;
  weightUnit: WeightUnit;
  chipNumber: string;
  ownerPhone: string;
  feeding: string;
  meds: string;
  walks: string;
  quirks: string;
  vetName: string;
  vetPhone: string;
  erHospital: string;
  emergencyAuth: string;
  vaccines: VaccineRecord[];
  weightHistory: WeightEntry[];
}

export interface IncludedSections {
  feeding: boolean;
  meds: boolean;
  walks: boolean;
  quirks: boolean;
  vet: boolean;
  emergencyAuth: boolean;
  vaccines: boolean;
}

export interface SharedSnapshot {
  pets: PetProfile[];
  included: IncludedSections;
}
```

---

### 5. Security, Battery & Performance Architecture
- **Write-Protected Sitter Codes**: `POST /api/cards` generates a 6-character code using `crypto.randomInt()` alongside a 32-byte secret `editToken` (stored as a SHA-256 hash on the server and saved in the owner's `localStorage`). Sitters with the 6-character code can only read (`GET /api/cards/:code`); only the owner with the `editToken` can update the card (`timingSafeEqual`).
- **Sanitization & Rate Limiting**: Deep server + client schema sanitization strips prototype pollution keys, caps string lengths, whitelists `data:image/(jpeg|png|webp);base64` avatars, and rate-limits API requests per IP.
- **Battery & Performance**: Camera tracks and wiggle animations automatically power down on `visibilitychange` (screen lock/backgrounding), `localStorage` writes are debounced (`300ms` + `pagehide` flush), and backend storage uses an in-memory `Map` with debounced async disk writes.

---

### 6. My Questions for You (Brainstorming Request)

Keeping in mind that I want to **strictly avoid feature creep, bloat, or user accounts**, what are the highest-impact, simplest additions or refinements I could make to this app?

Please organize your suggestions into:
1. **High-Impact Sitter Handoff Improvements**: Small, zero-friction touches that make a sitter's life easier during an actual stay or emergency.
2. **Owner Convenience & Peace of Mind**: Minimalist additions that make creating, maintaining, or reusing the card faster for pet owners.
3. **Emergency & Vet Readiness**: Anything critical missing from the Vet / ER / Lost Pet Flyer flow that veterinarians or emergency responders actually look for.
4. **What NOT to Add**: 3–5 tempting features that would ruin the simplicity of this app and should be avoided.

For every suggestion you make, explain **why** it fits the minimalist philosophy and **how** it would integrate into the existing 9-screen scaffold without adding clutter.

## COPY-PASTE PROMPT END
