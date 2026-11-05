# Pet Care Card — Consumer-Ready Blueprint

A production-ready, local-first pet care card app that walks the user through one focused step at a time with smooth directional slide transitions, universal in-place field editing, visited-page history tracking, 1-finger swipe navigation, and bottom navigation arrows on every screen.

## User Review & Critical Decisions

> [!IMPORTANT]
> Review the updated Phase 2 Blueprint below. Click **Proceed** or reply **"Okay go ahead"** to begin Phase 3 code implementation.

---

## Phase 2 Blueprint — Planned Changes

### 1. Page 1 ("Add a pet") Always Starts with 5 Circles
- Always initialize Page 1 with **5 circles** in the pentagon formation so all 5 slots are immediately ready.
- Retain long-press wiggle mode (red minus circle badge to delete circles, slightly opaque `+` circle to add circles back up to 5, and spring-physics realignment).

### 2. Zero Sample Card Content (Production-Ready)
- Strip out all Biscuit sample data, sample load buttons, and dummy fallback text/numbers.
- Every field across the app, share links, PDFs, and exported images uses strictly the user's real inputs.

### 3. Dedicated "Pet Name & Picture" Screen (Screen 2)
- Placed directly after Screen 1 ("Add a pet") so clicking a circle walks the user through adding their **pet's picture** and **pet's name** one step at a time before moving into the rest of the card.

### 4. In-Place Editing on Every Screen Where an Element Exists
- Users never have to leave a screen to edit data displayed on that screen:
  - **Pet Name & Picture Screen**: Edit photo and pet name directly.
  - **Pet Cards Screen**: Edit pet photo, name, age, breed, weight, and add/edit/remove vaccine reminder rows right on the card.
  - **Vet Visit (Vaccine & Weight Info) Screen**: Add, edit, and delete vaccine dates and weight history entries directly on that screen.
  - **Lost Pet Flyer Screen**: Edit pet photo, name, age, breed, weight, quirks/description, microchip number, and owner phone number directly inside the flyer.
  - **Edit Card Screen**: Edit photo, basics, and collapsible sections (**Feeding** open by default; **Meds**, **Walks**, **Quirks**, **Vet & Emergency Info**, and **Vaccines & Weight** collapsed).
  - **What the Sitter Sees Screen**: Edit any displayed care instruction, vet detail, emergency auth note, or phone number directly inline while previewing.

### 5. Bottom Back/Forward Arrows on Every Single Screen + Visited History & 1-Finger Swipe
- **Universal Bottom Arrows**: Every screen the app can possibly take you to—**1. Start**, **2. Name & Picture**, **3. Pet Cards**, **4. Vet Visit Info**, **5. Lost Pet Flyer**, **6. Edit Card**, **7. Share**, and **8. What the Sitter Sees**—includes the bottom navigation bar with back (`←`) and forward (`→`) arrows.
- **Visited Page History Stack**: Tracks the exact sequence of screens the user visits (`history[]` + `historyIndex`). Going back returns to the exact previous screen visited; going forward moves to the next visited screen in history (or advances to the next step in the main workflow when at the end of history).
- **1-Finger Horizontal Swipe Gesture**: Swiping/dragging horizontally with one finger across any screen navigates back or forward through the visited page stack with the same smooth directional spring-slide animation as clicking the arrows.
