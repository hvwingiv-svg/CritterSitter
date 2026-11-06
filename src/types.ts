export type WeightUnit = 'lbs' | 'oz';

export type SexStatus =
  | ''
  | 'M-Neutered'
  | 'M-Intact'
  | 'F-Spayed'
  | 'F-Intact';

export const SEX_STATUS_CYCLE: SexStatus[] = [
  '',
  'M-Neutered',
  'M-Intact',
  'F-Spayed',
  'F-Intact',
];

export function getNextSexStatus(current: SexStatus): SexStatus {
  const idx = SEX_STATUS_CYCLE.indexOf(current);
  if (idx === -1) return 'M-Neutered';
  return SEX_STATUS_CYCLE[(idx + 1) % SEX_STATUS_CYCLE.length];
}

export function formatWeightWithKg(
  weightVal: string,
  unit: WeightUnit = 'lbs'
): string {
  const trimmed = weightVal.trim();
  if (!trimmed) return '';
  const numeric = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return `${trimmed} ${unit}`;
  }
  const kg = unit === 'oz' ? numeric * 0.02834952 : numeric * 0.45359237;
  const kgFormatted =
    kg < 1 ? kg.toFixed(2).replace(/\.?0+$/, '') : kg.toFixed(1).replace(/\.0$/, '');
  return `${trimmed} ${unit} (${kgFormatted} kg)`;
}

/**
 * Formats a phone number to 10 digits (3-digit area code + 7-digit number) as (XXX) XXX-XXXX.
 * Strips all non-digit characters and caps at 10 digits.
 */
export function formatPhone10Digits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/**
 * Allows only digits 0-9 and at most a single decimal point (.) for weight fields.
 */
export function filterWeightInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const normalized =
    parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
  return normalized.slice(0, 6);
}

/**
 * Allows digits, letters, spaces, '.', '/', and '-' for age fields (e.g., "3", "2 yrs", "6 mos", "1.5").
 */
export function filterAgeInput(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z\s./-]/g, '').slice(0, 20);
}

/**
 * Allows letters, spaces, hyphens, apostrophes, and periods for pet name, breed, and contact name fields.
 * Prevents typing numbers or inappropriate symbols into name/breed inputs.
 */
export function filterNameInput(raw: string): string {
  return raw.replace(/[^\p{L}\s'.-]/gu, '').slice(0, 60);
}

/**
 * Allows alphanumeric characters and hyphens (auto-uppercased, max 15 chars) for microchip numbers.
 */
export function filterChipInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 15);
}

/**
 * Allows alphanumeric characters only (auto-uppercased, max 6 chars) for sitter share codes.
 */
export function filterSitterCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}


export interface VaccineRecord {
  id: string;
  name: string;
  dateGiven: string;
  expiresAt: string;
}

export interface WeightEntry {
  id: string;
  date: string;
  weightLbs: string;
  weightUnit?: WeightUnit;
}

export interface PetProfile {
  slotIndex: number;
  name: string;
  age: string;
  breed: string;
  sexStatus: SexStatus;
  weightLbs: string;
  weightUnit: WeightUnit;
  photoUrl: string;
  chipNumber: string;
  ownerPhone: string;
  backupContactName: string;
  backupContactPhone: string;
  lastSeenLocation: string;
  lastSeenLat: number | null;
  lastSeenLng: number | null;
  doNotChase: boolean;
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

export interface ShareConfig {
  selectedSlots: number[];
  included: IncludedSections;
}

export interface SharedSnapshot {
  pets: PetProfile[];
  included: IncludedSections;
}

export function createEmptyPet(slotIndex: number): PetProfile {
  return {
    slotIndex,
    name: '',
    age: '',
    breed: '',
    sexStatus: '',
    weightLbs: '',
    weightUnit: 'lbs',
    photoUrl: '',
    chipNumber: '',
    ownerPhone: '',
    backupContactName: '',
    backupContactPhone: '',
    lastSeenLocation: '',
    lastSeenLat: null,
    lastSeenLng: null,
    doNotChase: false,
    feeding: '',
    meds: '',
    walks: '',
    quirks: '',
    vetName: '',
    vetPhone: '',
    erHospital: '',
    emergencyAuth: '',
    vaccines: [],
    weightHistory: [],
  };
}

export function getDefaultIncludedSections(): IncludedSections {
  return {
    feeding: true,
    meds: true,
    walks: true,
    quirks: true,
    vet: true,
    emergencyAuth: true,
    vaccines: true,
  };
}

const SAFE_DATA_IMAGE_RE =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function sanitizePhotoUrl(val: unknown): string {
  if (typeof val !== 'string' || val.length === 0 || val.length > 350000) {
    return '';
  }
  return SAFE_DATA_IMAGE_RE.test(val) ? val : '';
}

function cleanText(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

const VALID_SEX_STATUSES: SexStatus[] = [
  '',
  'M-Neutered',
  'M-Intact',
  'F-Spayed',
  'F-Intact',
];

export function sanitizePetProfile(raw: unknown, fallbackSlot = 0): PetProfile {
  const p =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const vaccinesRaw = Array.isArray(p.vaccines) ? p.vaccines.slice(0, 50) : [];
  const weightRaw = Array.isArray(p.weightHistory)
    ? p.weightHistory.slice(0, 50)
    : [];
  const rawSex = typeof p.sexStatus === 'string' ? (p.sexStatus as SexStatus) : '';

  return {
    slotIndex:
      typeof p.slotIndex === 'number' &&
      Number.isInteger(p.slotIndex) &&
      p.slotIndex >= 0 &&
      p.slotIndex < 5
        ? p.slotIndex
        : fallbackSlot,
    name: cleanText(p.name, 100),
    age: cleanText(p.age, 60),
    breed: cleanText(p.breed, 100),
    sexStatus: VALID_SEX_STATUSES.includes(rawSex) ? rawSex : '',
    weightLbs: cleanText(p.weightLbs, 40),
    weightUnit: p.weightUnit === 'oz' ? 'oz' : 'lbs',
    photoUrl: sanitizePhotoUrl(p.photoUrl),
    chipNumber: cleanText(p.chipNumber, 80),
    ownerPhone: cleanText(p.ownerPhone, 60),
    backupContactName: cleanText(p.backupContactName, 120),
    backupContactPhone: cleanText(p.backupContactPhone, 60),
    lastSeenLocation: cleanText(p.lastSeenLocation, 200),
    lastSeenLat:
      typeof p.lastSeenLat === 'number' &&
      Number.isFinite(p.lastSeenLat) &&
      p.lastSeenLat >= -90 &&
      p.lastSeenLat <= 90
        ? p.lastSeenLat
        : null,
    lastSeenLng:
      typeof p.lastSeenLng === 'number' &&
      Number.isFinite(p.lastSeenLng) &&
      p.lastSeenLng >= -180 &&
      p.lastSeenLng <= 180
        ? p.lastSeenLng
        : null,
    doNotChase: Boolean(p.doNotChase),
    feeding: cleanText(p.feeding, 2000),
    meds: cleanText(p.meds, 2000),
    walks: cleanText(p.walks, 2000),
    quirks: cleanText(p.quirks, 2000),
    vetName: cleanText(p.vetName, 120),
    vetPhone: cleanText(p.vetPhone, 60),
    erHospital: cleanText(p.erHospital, 200),
    emergencyAuth: cleanText(p.emergencyAuth, 2000),
    vaccines: vaccinesRaw.map((vItem, vIdx) => {
      const v =
        vItem && typeof vItem === 'object'
          ? (vItem as Record<string, unknown>)
          : {};
      return {
        id: cleanText(v.id, 60) || `v-${vIdx}`,
        name: cleanText(v.name, 120),
        dateGiven: cleanText(v.dateGiven, 30),
        expiresAt: cleanText(v.expiresAt, 30),
      };
    }),
    weightHistory: weightRaw.map((wItem, wIdx) => {
      const w =
        wItem && typeof wItem === 'object'
          ? (wItem as Record<string, unknown>)
          : {};
      return {
        id: cleanText(w.id, 60) || `w-${wIdx}`,
        date: cleanText(w.date, 30),
        weightLbs: cleanText(w.weightLbs, 40),
        weightUnit: w.weightUnit === 'oz' ? 'oz' : 'lbs',
      };
    }),
  };
}

export function sanitizeSnapshot(raw: unknown): SharedSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.pets) || obj.pets.length === 0) return null;

  const pets = obj.pets
    .slice(0, 5)
    .map((item, idx) => sanitizePetProfile(item, idx));
  const incRaw =
    obj.included && typeof obj.included === 'object'
      ? (obj.included as Record<string, unknown>)
      : {};

  return {
    pets,
    included: {
      feeding: incRaw.feeding !== false,
      meds: incRaw.meds !== false,
      walks: incRaw.walks !== false,
      quirks: incRaw.quirks !== false,
      vet: incRaw.vet !== false,
      emergencyAuth: incRaw.emergencyAuth !== false,
      vaccines: incRaw.vaccines !== false,
    },
  };
}

export function encodeSnapshotToHash(snapshot: SharedSnapshot): string {
  try {
    const json = JSON.stringify(snapshot);
    const encoded = btoa(encodeURIComponent(json));
    return `#card=${encoded}`;
  } catch {
    return '';
  }
}

export function decodeSnapshotFromHash(hash: string): SharedSnapshot | null {
  try {
    if (!hash.startsWith('#card=') || hash.length > 500000) return null;
    const raw = hash.slice('#card='.length);
    const json = decodeURIComponent(atob(raw));
    return sanitizeSnapshot(JSON.parse(json));
  } catch {
    return null;
  }
}

export function getDaysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Read a named color from design/tokens.json (via src/tokens.css) for canvas drawing. */
function tokenColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return v || fallback;
}

export function exportCardAsImage(pets: PetProfile[], included: IncludedSections) {
  const canvas = document.createElement('canvas');
  const width = 800;
  const height = Math.max(960, 420 + pets.length * 500);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = tokenColor('cs-surface', '#ffffff');
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = tokenColor('cs-accent', '#0d5c46');
  ctx.fillRect(0, 0, width, 12);

  let y = 56;
  ctx.fillStyle = tokenColor('cs-ink', '#0f172a');
  ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Pet Care Card', 48, y);
  y += 36;

  const drawWrapped = (label: string, text: string, startY: number): number => {
    if (!text) return startY;
    ctx.fillStyle = tokenColor('cs-accent', '#0d5c46');
    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(label, 48, startY);
    let cy = startY + 24;
    ctx.fillStyle = tokenColor('cs-ink-2', '#1e293b');
    ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > width - 96) {
        ctx.fillText(line, 48, cy);
        line = w;
        cy += 24;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, 48, cy);
      cy += 32;
    }
    return cy;
  };

  for (const pet of pets) {
    ctx.strokeStyle = tokenColor('cs-line', '#e2e8f0');
    ctx.beginPath();
    ctx.moveTo(48, y);
    ctx.lineTo(width - 48, y);
    ctx.stroke();
    y += 36;

    ctx.fillStyle = tokenColor('cs-ink', '#0f172a');
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    const subtitle = [pet.age, pet.breed, pet.sexStatus]
      .filter(Boolean)
      .join(' · ');
    const weightPart = pet.weightLbs
      ? `, ${formatWeightWithKg(pet.weightLbs, pet.weightUnit || 'lbs')}`
      : '';
    const headerLine = `${pet.name || 'Pet'}${subtitle || weightPart ? ` · ${subtitle}${weightPart}` : ''}`;
    ctx.fillText(headerLine, 48, y);
    y += 36;

    if (included.feeding && pet.feeding) y = drawWrapped('Feeding:', pet.feeding, y);
    if (included.meds && pet.meds) y = drawWrapped('Meds:', pet.meds, y);
    if (included.walks && pet.walks) y = drawWrapped('Walks:', pet.walks, y);
    if (included.quirks && pet.quirks) y = drawWrapped('Quirks:', pet.quirks, y);
    if (
      included.vet &&
      (pet.vetName ||
        pet.vetPhone ||
        pet.erHospital ||
        pet.backupContactName ||
        pet.backupContactPhone)
    ) {
      const vetParts = [pet.vetName, pet.vetPhone].filter(Boolean).join(', ');
      const erPart = pet.erHospital ? ` After-hours ER: ${pet.erHospital}.` : '';
      const backupPart =
        pet.backupContactName || pet.backupContactPhone
          ? ` Backup contact: ${[pet.backupContactName, pet.backupContactPhone]
              .filter(Boolean)
              .join(' ')}`
          : '';
      const vetLine = `${vetParts}${vetParts ? '.' : ''}${erPart}${backupPart}`.trim();
      y = drawWrapped('Vet & Emergency:', vetLine, y);
    }
    if (included.emergencyAuth && pet.emergencyAuth) {
      y = drawWrapped("If something's wrong:", pet.emergencyAuth, y);
    }
    if (included.vaccines && pet.vaccines.length > 0) {
      const vaxLine = pet.vaccines
        .map((v) => `${v.name} (exp. ${v.expiresAt || '—'})`)
        .join(' · ');
      y = drawWrapped('Vaccines:', vaxLine, y);
    }
    y += 16;
  }

  const firstPetName = (pets[0]?.name || 'pet').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const fileName = `${firstPetName}-care-card.png`;

  canvas.toBlob(async (blob) => {
    if (blob && typeof navigator !== 'undefined' && navigator.canShare) {
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Pet Care Card',
            files: [file],
          });
          return;
        } catch {
          // User dismissed share sheet or share failed; fall back to download
        }
      }
    }
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, 'image/png');
}
