import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), '.sitter-codes.json');
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_STORED_CARDS = 2000;
const SAFE_DATA_IMAGE_RE =
  /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

interface StoredEntry {
  snapshot: unknown;
  tokenHash: string;
  updatedAt: number;
}

const cardStore = new Map<string, StoredEntry>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cleanStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.slice(0, maxLen);
}

function cleanPhotoUrl(val: unknown): string {
  if (typeof val !== 'string' || val.length === 0 || val.length > 350000) {
    return '';
  }
  return SAFE_DATA_IMAGE_RE.test(val) ? val : '';
}

function sanitizeSnapshot(raw: unknown): {
  pets: unknown[];
  included: Record<string, boolean>;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.pets) || obj.pets.length === 0) return null;

  const pets = obj.pets.slice(0, 5).map((item, idx) => {
    const p =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};
    const vaccinesRaw = Array.isArray(p.vaccines) ? p.vaccines.slice(0, 50) : [];
    const weightRaw = Array.isArray(p.weightHistory)
      ? p.weightHistory.slice(0, 50)
      : [];

    const validSexStatuses = ['M-Neutered', 'M-Intact', 'F-Spayed', 'F-Intact'];
    const rawSex = typeof p.sexStatus === 'string' ? p.sexStatus : '';

    return {
      slotIndex:
        typeof p.slotIndex === 'number' &&
        Number.isInteger(p.slotIndex) &&
        p.slotIndex >= 0 &&
        p.slotIndex < 5
          ? p.slotIndex
          : idx,
      name: cleanStr(p.name, 100),
      age: cleanStr(p.age, 60),
      breed: cleanStr(p.breed, 100),
      sexStatus: validSexStatuses.includes(rawSex) ? rawSex : '',
      weightLbs: cleanStr(p.weightLbs, 40),
      weightUnit: p.weightUnit === 'oz' ? 'oz' : 'lbs',
      photoUrl: cleanPhotoUrl(p.photoUrl),
      chipNumber: cleanStr(p.chipNumber, 80),
      ownerPhone: cleanStr(p.ownerPhone, 60),
      backupContactName: cleanStr(p.backupContactName, 120),
      backupContactPhone: cleanStr(p.backupContactPhone, 60),
      lastSeenLocation: cleanStr(p.lastSeenLocation, 200),
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
      feeding: cleanStr(p.feeding, 2000),
      meds: cleanStr(p.meds, 2000),
      walks: cleanStr(p.walks, 2000),
      quirks: cleanStr(p.quirks, 2000),
      vetName: cleanStr(p.vetName, 120),
      vetPhone: cleanStr(p.vetPhone, 60),
      erHospital: cleanStr(p.erHospital, 200),
      emergencyAuth: cleanStr(p.emergencyAuth, 2000),
      vaccines: vaccinesRaw.map((vItem, vIdx) => {
        const v =
          vItem && typeof vItem === 'object'
            ? (vItem as Record<string, unknown>)
            : {};
        return {
          id: cleanStr(v.id, 60) || `v-${vIdx}`,
          name: cleanStr(v.name, 120),
          dateGiven: cleanStr(v.dateGiven, 30),
          expiresAt: cleanStr(v.expiresAt, 30),
        };
      }),
      weightHistory: weightRaw.map((wItem, wIdx) => {
        const w =
          wItem && typeof wItem === 'object'
            ? (wItem as Record<string, unknown>)
            : {};
        return {
          id: cleanStr(w.id, 60) || `w-${wIdx}`,
          date: cleanStr(w.date, 30),
          weightLbs: cleanStr(w.weightLbs, 40),
          weightUnit: w.weightUnit === 'oz' ? 'oz' : 'lbs',
        };
      }),
    };
  });

  const incRaw =
    obj.included && typeof obj.included === 'object'
      ? (obj.included as Record<string, unknown>)
      : {};

  const included = {
    feeding: incRaw.feeding !== false,
    meds: incRaw.meds !== false,
    walks: incRaw.walks !== false,
    quirks: incRaw.quirks !== false,
    vet: incRaw.vet !== false,
    emergencyAuth: incRaw.emergencyAuth !== false,
    vaccines: incRaw.vaccines !== false,
  };

  return { pets, included };
}

function loadInitialStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [key, val] of Object.entries(
          parsed as Record<string, unknown>
        )) {
          if (!/^[A-Z0-9]{6}$/.test(key)) continue;
          if (val && typeof val === 'object') {
            const entry = val as Record<string, unknown>;
            const sanitized = sanitizeSnapshot(entry.snapshot);
            if (sanitized) {
              cardStore.set(key, {
                snapshot: sanitized,
                tokenHash:
                  typeof entry.tokenHash === 'string' ? entry.tokenHash : '',
                updatedAt:
                  typeof entry.updatedAt === 'number'
                    ? entry.updatedAt
                    : Date.now(),
              });
            }
          }
        }
      }
    }
  } catch {
    // ignore read errors on startup
  }
}

function scheduleAsyncSave() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    try {
      const serializable: Record<string, StoredEntry> = Object.create(null);
      for (const [k, v] of cardStore.entries()) {
        serializable[k] = v;
      }
      await fs.promises.writeFile(
        DATA_FILE,
        JSON.stringify(serializable),
        'utf-8'
      );
    } catch {
      // ignore disk write errors
    }
  }, 250);
}

function evictOldestIfNeeded() {
  if (cardStore.size < MAX_STORED_CARDS) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, v] of cardStore.entries()) {
    if (v.updatedAt < oldestTime) {
      oldestTime = v.updatedAt;
      oldestKey = k;
    }
  }
  if (oldestKey) {
    cardStore.delete(oldestKey);
  }
}

function generateSecureCode(): string {
  for (let attempt = 0; attempt < 64; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      const idx = crypto.randomInt(0, CODE_CHARS.length);
      code += CODE_CHARS[idx];
    }
    if (!cardStore.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyTokenHash(token: string, expectedHexHash: string): boolean {
  if (!token || !expectedHexHash || expectedHexHash.length !== 64) return false;
  try {
    const actualBuf = Buffer.from(hashToken(token), 'hex');
    const expectedBuf = Buffer.from(expectedHexHash, 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

// Lightweight per-IP rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(
  ip: string,
  bucketKey: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const key = `${bucketKey}:${ip}`;
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (now > v.resetAt) rateBuckets.delete(k);
      }
    }
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

async function startServer() {
  loadInitialStore();

  const app = express();
  app.disable('x-powered-by');

  // Hardened HTTP security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(), geolocation=()'
    );
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  // Create or update a 6-character Sitter Code (owner write-protected via editToken)
  app.post('/api/cards', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'post_card', 25, 10 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many requests. Please wait.' });
      return;
    }

    const sanitized = sanitizeSnapshot(req.body?.snapshot);
    if (!sanitized) {
      res.status(400).json({ error: 'Invalid card snapshot' });
      return;
    }

    const requestedCode =
      typeof req.body?.code === 'string'
        ? req.body.code.trim().toUpperCase()
        : '';
    const providedToken =
      typeof req.body?.editToken === 'string' ? req.body.editToken.trim() : '';
    const shouldRotate = Boolean(req.body?.rotate);

    let code = '';
    let editToken = '';

    if (
      /^[A-Z0-9]{6}$/.test(requestedCode) &&
      cardStore.has(requestedCode) &&
      providedToken
    ) {
      const existing = cardStore.get(requestedCode)!;
      if (verifyTokenHash(providedToken, existing.tokenHash)) {
        if (shouldRotate) {
          cardStore.delete(requestedCode);
        } else {
          code = requestedCode;
          editToken = providedToken;
        }
      }
    }

    if (!code) {
      evictOldestIfNeeded();
      code = generateSecureCode();
      editToken = crypto.randomBytes(32).toString('hex');
    }

    cardStore.set(code, {
      snapshot: sanitized,
      tokenHash: hashToken(editToken),
      updatedAt: Date.now(),
    });

    scheduleAsyncSave();
    res.json({ code, editToken });
  });

  // Retrieve a pet card snapshot by its 6-character Sitter Code (read-only)
  app.get('/api/cards/:code', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'get_card', 60, 10 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many code attempts. Please wait.' });
      return;
    }

    const rawCode = String(req.params.code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(rawCode)) {
      res.status(400).json({ error: 'Invalid sitter code format' });
      return;
    }

    const entry = cardStore.get(rawCode);
    if (!entry || !entry.snapshot) {
      res.status(404).json({ error: 'Sitter code not found' });
      return;
    }

    res.json({ code: rawCode, snapshot: entry.snapshot });
  });

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';

    // Serve a clean, WebSocket-free Vite client shim in preview middleware mode
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(`
export class ErrorOverlay extends HTMLElement {}
if (typeof customElements !== 'undefined' && !customElements.get('vite-error-overlay')) {
  customElements.define('vite-error-overlay', ErrorOverlay);
}
export function createHotContext() {
  return {
    accept() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
    data: {}
  };
}
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  }
  style.textContent = content;
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function injectQuery(url) {
  return url;
}
`);
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
