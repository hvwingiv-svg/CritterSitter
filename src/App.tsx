/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Download,
  Image as ImageIcon,
  KeyRound,
  MapPin,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  createEmptyPet,
  decodeSnapshotFromHash,
  exportCardAsImage,
  filterAgeInput,
  filterChipInput,
  filterNameInput,
  filterSitterCodeInput,
  filterWeightInput,
  formatPhone10Digits,
  formatWeightWithKg,
  getDaysUntil,
  getDefaultIncludedSections,
  IncludedSections,
  PetProfile,
  sanitizePetProfile,
  sanitizeSnapshot,
  SexStatus,
  ShareConfig,
  SharedSnapshot,
  WeightUnit,
} from './types';
import { CrossStreetMapPicker } from './components/CrossStreetMapPicker';

const STORAGE_KEY = 'pet_care_card_circles_v3';
const ACTIVE_CIRCLE_STORAGE_KEY = 'pet_care_card_active_circle_v1';
const SITTER_AUTH_STORAGE_KEY = 'pet_care_card_sitter_auth_v1';
const SITTER_CACHE_STORAGE_KEY = 'pet_care_card_cached_sitter_v1';

function isPetAlreadyAdded(pet: PetProfile | null | undefined): boolean {
  return Boolean(pet?.name?.trim()) || Boolean(pet?.photoUrl);
}

interface CircleSlot {
  id: string;
  pet: PetProfile | null;
}

type ScreenId =
  | 'role-select'
  | 'sitter-import'
  | 'start'
  | 'name-photo'
  | 'pet-cards'
  | 'vet-visit'
  | 'lost-flyer'
  | 'share'
  | 'sitter-view';

type AccordionSection =
  | 'feeding'
  | 'meds'
  | 'walks'
  | 'quirks'
  | 'vet'
  | 'vaccines'
  | null;

const SCREEN_LABELS: Record<ScreenId, string> = {
  'role-select': 'Welcome',
  'sitter-import': 'Enter sitter code',
  start: 'The Paw',
  'name-photo': 'Pet name & picture',
  'pet-cards': 'Pet cards',
  'vet-visit': 'Vaccine & weight info',
  'lost-flyer': 'Lost pet flyer',
  share: 'Share',
  'sitter-view': 'What the sitter sees',
};

const NEXT_DEFAULT_SCREEN: Record<ScreenId, ScreenId | null> = {
  'role-select': 'start',
  'sitter-import': 'sitter-view',
  start: 'name-photo',
  'name-photo': 'pet-cards',
  'pet-cards': 'share',
  'vet-visit': 'share',
  'lost-flyer': 'share',
  share: 'sitter-view',
  'sitter-view': null,
};

const PREV_DEFAULT_SCREEN: Record<ScreenId, ScreenId | null> = {
  'role-select': null,
  'sitter-import': 'role-select',
  start: 'role-select',
  'name-photo': 'start',
  'pet-cards': 'name-photo',
  'vet-visit': 'pet-cards',
  'lost-flyer': 'pet-cards',
  share: 'pet-cards',
  'sitter-view': 'share',
};

// Always start Page 1 with 5 circles on load
function createInitialCircles(): CircleSlot[] {
  const defaultFive: CircleSlot[] = [
    { id: 'circle-0', pet: null },
    { id: 'circle-1', pet: null },
    { id: 'circle-2', pet: null },
    { id: 'circle-3', pet: null },
    { id: 'circle-4', pet: null },
  ];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return defaultFive.map((slot, idx) => ({
          id:
            typeof parsed[idx]?.id === 'string' && parsed[idx].id.length <= 64
              ? parsed[idx].id
              : slot.id,
          pet: parsed[idx]?.pet
            ? sanitizePetProfile(parsed[idx].pet, idx)
            : null,
        }));
      }
    }
  } catch {
    // ignore storage errors
  }
  return defaultFive;
}

interface PawPosition {
  x: number;
  y: number;
  isMainPad: boolean;
}

// Paw-print layout: Index 0 is the large bottom palm pad; Indices 1..4 are the upper toe beans
function getPawPositions(count: number): PawPosition[] {
  if (count <= 0) return [];
  if (count === 1) {
    return [{ x: 0, y: 24, isMainPad: true }];
  }
  const mainPad: PawPosition = { x: 0, y: 84, isMainPad: true };
  const toeCount = count - 1;
  if (toeCount === 1) {
    return [mainPad, { x: 0, y: -88, isMainPad: false }];
  }
  if (toeCount === 2) {
    return [
      mainPad,
      { x: -58, y: -82, isMainPad: false },
      { x: 58, y: -82, isMainPad: false },
    ];
  }
  if (toeCount === 3) {
    return [
      mainPad,
      { x: -94, y: -48, isMainPad: false },
      { x: 0, y: -96, isMainPad: false },
      { x: 94, y: -48, isMainPad: false },
    ];
  }
  return [
    mainPad,
    { x: -116, y: -20, isMainPad: false },
    { x: -42, y: -96, isMainPad: false },
    { x: 42, y: -96, isMainPad: false },
    { x: 116, y: -20, isMainPad: false },
  ];
}

const pageSlideVariants = {
  enter: (direction: number) => ({
    x: direction >= 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction >= 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

const pageSpringTransition = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 32,
  mass: 0.85,
};

const dropdownSpringTransition = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
  mass: 0.7,
};

export default function App() {
  const [sharedSnapshot, setSharedSnapshot] = useState<SharedSnapshot | null>(() =>
    decodeSnapshotFromHash(window.location.hash)
  );

  const [circles, setCircles] = useState<CircleSlot[]>(createInitialCircles);

  // Full visited-page history stack + current index + animation direction
  const [navState, setNavState] = useState<{
    history: ScreenId[];
    index: number;
    direction: number;
  }>(() => {
    const initialScreen: ScreenId = decodeSnapshotFromHash(window.location.hash)
      ? 'sitter-view'
      : 'role-select';
    return {
      history: [initialScreen],
      index: 0,
      direction: 0,
    };
  });

  const currentScreen: ScreenId =
    navState.history[navState.index] || 'role-select';

  // Push a new screen onto the visited history stack and sync with Android hardware Back button
  const navigateToScreen = (nextScreen: ScreenId, forcedDirection = 1) => {
    setNavState((prev) => {
      const current = prev.history[prev.index];
      if (current === nextScreen) return prev;
      const truncated = prev.history.slice(0, prev.index + 1);
      const nextHistory = [...truncated, nextScreen];
      const nextIndex = truncated.length;
      try {
        window.history.pushState(
          { apkNavIndex: nextIndex, screen: nextScreen },
          ''
        );
      } catch {
        // ignore history state errors in sandboxed iframes
      }
      return {
        history: nextHistory,
        index: nextIndex,
        direction: forcedDirection,
      };
    });
  };

  const [activeCircleId, setActiveCircleId] = useState<string>(() => {
    const initial = createInitialCircles();
    try {
      const savedId = localStorage.getItem(ACTIVE_CIRCLE_STORAGE_KEY);
      if (savedId && initial.some((c) => c.id === savedId)) {
        return savedId;
      }
    } catch {
      // ignore storage errors
    }
    const firstWithPet = initial.find((c) => isPetAlreadyAdded(c.pet));
    return firstWithPet?.id || initial[0]?.id || 'circle-0';
  });

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_CIRCLE_STORAGE_KEY, activeCircleId);
    } catch {
      // ignore storage errors
    }
  }, [activeCircleId]);

  const activeIndex = Math.max(
    0,
    circles.findIndex((c) => c.id === activeCircleId)
  );
  const activeCircle = circles[activeIndex];
  const currentPet: PetProfile =
    activeCircle?.pet ?? createEmptyPet(activeIndex);

  const getFallbackNextScreen = (screen: ScreenId): ScreenId | null => {
    if (screen === 'start' && isPetAlreadyAdded(currentPet)) {
      return 'pet-cards';
    }
    return NEXT_DEFAULT_SCREEN[screen];
  };

  const getFallbackPrevScreen = (screen: ScreenId): ScreenId | null => {
    if (screen === 'pet-cards' && isPetAlreadyAdded(currentPet)) {
      return 'start';
    }
    return PREV_DEFAULT_SCREEN[screen];
  };

  const canGoBack =
    navState.index > 0 || getFallbackPrevScreen(currentScreen) !== null;

  const canGoForward =
    navState.index < navState.history.length - 1 ||
    getFallbackNextScreen(currentScreen) !== null;

  const prevScreenLabel = (): string => {
    if (navState.index > 0) {
      return SCREEN_LABELS[navState.history[navState.index - 1]];
    }
    const fallbackPrev = getFallbackPrevScreen(currentScreen);
    return fallbackPrev ? SCREEN_LABELS[fallbackPrev] : '';
  };

  const nextScreenLabel = (): string => {
    if (navState.index < navState.history.length - 1) {
      return SCREEN_LABELS[navState.history[navState.index + 1]];
    }
    const fallbackNext = getFallbackNextScreen(currentScreen);
    return fallbackNext ? SCREEN_LABELS[fallbackNext] : '';
  };

  const handleGoBack = () => {
    setNavState((prev) => {
      if (prev.index > 0) {
        return {
          ...prev,
          index: prev.index - 1,
          direction: -1,
        };
      }
      const cur = prev.history[prev.index];
      const fallbackPrev = getFallbackPrevScreen(cur);
      if (!fallbackPrev) return prev;
      return {
        history: [fallbackPrev, ...prev.history],
        index: 0,
        direction: -1,
      };
    });
  };

  const handleGoForward = () => {
    setNavState((prev) => {
      if (prev.index < prev.history.length - 1) {
        return {
          ...prev,
          index: prev.index + 1,
          direction: 1,
        };
      }
      const cur = prev.history[prev.index];
      const fallbackNext = getFallbackNextScreen(cur);
      if (!fallbackNext) return prev;
      return {
        history: [...prev.history, fallbackNext],
        index: prev.index + 1,
        direction: 1,
      };
    });
  };

  // 1-Finger Horizontal Swipe Gesture Tracking
  const swipeStartRef = useRef<{
    x: number;
    y: number;
    ignore: boolean;
  } | null>(null);

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isInput =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      Boolean(target?.closest('[data-no-swipe="true"]'));
    swipeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ignore: isInput,
    };
  };

  const handleContainerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeStartRef.current || swipeStartRef.current.ignore) {
      swipeStartRef.current = null;
      return;
    }
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    // Require clear horizontal 1-finger swipe
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0 && canGoForward) {
        handleGoForward();
      } else if (dx > 0 && canGoBack) {
        handleGoBack();
      }
    }
  };

  // Wiggle & drag-reorder state on The Paw screen
  const [isWiggling, setIsWiggling] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [draggingCircleId, setDraggingCircleId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const dragStateRef = useRef<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    hasMoved: boolean;
  } | null>(null);

  // Edit Card screen: Feeding section open by default, others collapsed
  const [openSection, setOpenSection] = useState<AccordionSection>('feeding');
  const [expandedSitterPets, setExpandedSitterPets] = useState<
    Record<string, boolean>
  >({});
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  // Universal Share configuration (single universal card for anyone watching the pet)
  const [shareConfig, setShareConfig] = useState<ShareConfig>({
    selectedSlots: [0],
    included: getDefaultIncludedSections(),
  });

  // Sitter Code state (anonymous 6-character code, no login required, write-protected by owner editToken)
  const [generatedCode, setGeneratedCode] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SITTER_AUTH_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return typeof parsed?.code === 'string' ? parsed.code : '';
    } catch {
      return '';
    }
  });
  const [generatedEditToken, setGeneratedEditToken] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(SITTER_AUTH_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return typeof parsed?.editToken === 'string' ? parsed.editToken : '';
    } catch {
      return '';
    }
  });
  const [isGeneratingCode, setIsGeneratingCode] = useState<boolean>(false);
  const [isRotatingCode, setIsRotatingCode] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [sitterCodeInput, setSitterCodeInput] = useState<string>('');
  const [sitterCodeError, setSitterCodeError] = useState<string>('');
  const [isLoadingSitterCode, setIsLoadingSitterCode] = useState<boolean>(false);
  const [backupStatusMessage, setBackupStatusMessage] = useState<string>('');

  // Offline Sitter Caching state (stores last-viewed sitter card in localStorage)
  const [cachedSitterCard, setCachedSitterCard] = useState<{
    code: string;
    snapshot: SharedSnapshot;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(SITTER_CACHE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const cleanSnap = sanitizeSnapshot(parsed?.snapshot);
      const cleanCode =
        typeof parsed?.code === 'string'
          ? parsed.code.trim().toUpperCase()
          : '';
      if (cleanSnap && /^[A-Z0-9]{6}$/.test(cleanCode)) {
        return { code: cleanCode, snapshot: cleanSnap };
      }
      return null;
    } catch {
      return null;
    }
  });

  const saveSitterCache = (code: string, snapshot: SharedSnapshot) => {
    const cleanCode = code.trim().toUpperCase();
    setCachedSitterCard({ code: cleanCode, snapshot });
    try {
      localStorage.setItem(
        SITTER_CACHE_STORAGE_KEY,
        JSON.stringify({ code: cleanCode, snapshot })
      );
    } catch {
      // ignore storage errors
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Photo source action sheet & live camera viewfinder state
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const stopLiveCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Battery optimization: stop wiggle animation when leaving the Start screen
  useEffect(() => {
    if (currentScreen !== 'start' && isWiggling) {
      setIsWiggling(false);
    }
  }, [currentScreen, isWiggling]);

  // Battery optimization: immediately release camera hardware & pause animations when app is backgrounded or screen locks
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLiveCamera();
        setShowPhotoMenu(false);
        setIsWiggling(false);
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const startLiveCamera = async (mode: 'environment' | 'user' = cameraFacingMode) => {
    setShowPhotoMenu(false);
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      cameraCaptureInputRef.current?.click();
      return;
    }
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setCameraFacingMode(mode);
      setIsCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // Fallback to native hardware camera capture input if permission or stream fails
      cameraCaptureInputRef.current?.click();
    }
  };

  const handleFlipCamera = () => {
    const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    startLiveCamera(nextMode);
  };

  const handleSnapPhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      stopLiveCamera();
      return;
    }
    const canvas = document.createElement('canvas');
    const maxDim = 320;
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > h && w > maxDim) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else if (h >= w && h > maxDim) {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (cameraFacingMode === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      updateCurrentPet((prev) => ({ ...prev, photoUrl: dataUrl }));
    }
    stopLiveCamera();
  };

  const openPhotoSourceMenu = () => {
    setShowPhotoMenu(true);
  };

  // Dismiss keyboard when hitting Return / Enter in any field
  const handleFieldKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        e.preventDefault();
        target?.blur();
      }
    }
  };

  // Debounced localStorage persistence (300ms) + immediate flush on pagehide/backgrounding to save battery & prevent keystroke frame drops
  const latestCirclesRef = useRef<CircleSlot[]>(circles);
  latestCirclesRef.current = circles;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(circles));
      } catch {
        // ignore storage errors
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [circles]);

  useEffect(() => {
    const flushStorage = () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(latestCirclesRef.current)
        );
      } catch {
        // ignore storage errors
      }
    };
    window.addEventListener('pagehide', flushStorage);
    return () => window.removeEventListener('pagehide', flushStorage);
  }, []);

  // Listen for hash changes and Android hardware Back button (popstate)
  useEffect(() => {
    const onHashChange = () => {
      const decoded = decodeSnapshotFromHash(window.location.hash);
      if (decoded) {
        setSharedSnapshot(decoded);
        navigateToScreen('sitter-view', 1);
      }
    };

    const onPopState = () => {
      if (decodeSnapshotFromHash(window.location.hash)) return;
      setNavState((prev) => {
        if (prev.index > 0) {
          return {
            ...prev,
            index: prev.index - 1,
            direction: -1,
          };
        }
        const cur = prev.history[prev.index];
        const fallbackPrev = PREV_DEFAULT_SCREEN[cur];
        if (!fallbackPrev) return prev;
        return {
          history: [fallbackPrev, ...prev.history],
          index: 0,
          direction: -1,
        };
      });
    };

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // Deep-link auto-import: ?code=XXXXXX bypasses welcome & code entry screens
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawParamCode = params.get('code');
      if (!rawParamCode) return;
      const cleanCode = rawParamCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z0-9]{6}$/.test(cleanCode)) return;

      // Clean ?code= from URL bar without reloading
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);

      (async () => {
        setIsLoadingSitterCode(true);
        try {
          const res = await fetch(`/api/cards/${encodeURIComponent(cleanCode)}`);
          if (res.ok) {
            const data = (await res.json()) as {
              code: string;
              snapshot: unknown;
            };
            const cleanSnapshot = sanitizeSnapshot(data?.snapshot);
            if (cleanSnapshot) {
              saveSitterCache(cleanCode, cleanSnapshot);
              setSharedSnapshot(cleanSnapshot);
              navigateToScreen('sitter-view', 1);
            }
          }
        } catch {
          // ignore network error on deep link
        } finally {
          setIsLoadingSitterCode(false);
        }
      })();
    } catch {
      // ignore URL parsing errors
    }
  }, []);

  const updatePetBySlot = (
    slotIdx: number,
    updater: (prev: PetProfile) => PetProfile
  ) => {
    setCircles((prev) =>
      prev.map((item, idx) => {
        if (idx !== slotIdx) return item;
        const base = item.pet ?? createEmptyPet(idx);
        const updated = updater({ ...base, slotIndex: idx });
        return { ...item, pet: updated };
      })
    );
  };

  const updateCurrentPet = (updater: (prev: PetProfile) => PetProfile) => {
    updatePetBySlot(activeIndex, updater);
  };

  // Long-press and slide/reorder handlers for circles on The Paw screen
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCirclePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    circle: CircleSlot,
    pos: PawPosition
  ) => {
    e.stopPropagation();
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture errors
    }
    dragStateRef.current = {
      id: circle.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      hasMoved: false,
    };
    setDragOffset({ x: 0, y: 0 });
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setIsWiggling(true);
    }, 420);
  };

  const handleCirclePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startClientX;
    const dy = e.clientY - st.startClientY;
    const dist = Math.hypot(dx, dy);

    if (!st.hasMoved && dist > 7) {
      st.hasMoved = true;
      clearLongPressTimer();
      setDraggingCircleId(st.id);
    }

    if (!st.hasMoved) return;

    const curX = st.originX + dx;
    const curY = st.originY + dy;

    // Check if pointer is close enough to another circle slot to swap positions live
    let swapTargetId: string | null = null;
    let swapTargetPos: PawPosition | null = null;
    for (const other of circles) {
      if (other.id === st.id) continue;
      const otherPos = circleLayoutMap.get(other.id);
      if (!otherPos) continue;
      const threshold = otherPos.isMainPad ? 68 : 46;
      if (Math.hypot(curX - otherPos.x, curY - otherPos.y) < threshold) {
        swapTargetId = other.id;
        swapTargetPos = otherPos;
        break;
      }
    }

    if (swapTargetId && swapTargetPos) {
      const draggedId = st.id;
      const targetId = swapTargetId;
      // Re-anchor drag origin to the newly claimed slot so the circle stays under the finger
      st.startClientX = e.clientX - (curX - swapTargetPos.x);
      st.startClientY = e.clientY - (curY - swapTargetPos.y);
      st.originX = swapTargetPos.x;
      st.originY = swapTargetPos.y;
      setDragOffset({
        x: curX - swapTargetPos.x,
        y: curY - swapTargetPos.y,
      });

      if (targetId === mainPadCircleId) {
        setActiveCircleId(draggedId);
      } else if (draggedId === mainPadCircleId) {
        setActiveCircleId(targetId);
      }

      setCircles((prev) => {
        const idxA = prev.findIndex((c) => c.id === draggedId);
        const idxB = prev.findIndex((c) => c.id === targetId);
        if (idxA === -1 || idxB === -1) return prev;
        const next = [...prev];
        const temp = next[idxA];
        next[idxA] = next[idxB];
        next[idxB] = temp;
        return next.map((c, idx) => ({
          ...c,
          pet: c.pet ? { ...c.pet, slotIndex: idx } : null,
        }));
      });
    } else {
      setDragOffset({ x: dx, y: dy });
    }
  };

  const handleCirclePointerUpOrLeave = (
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    clearLongPressTimer();
    const st = dragStateRef.current;
    if (st && st.pointerId === e.pointerId) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore pointer capture release errors
      }
      if (st.hasMoved) {
        longPressTriggeredRef.current = true;
      }
      dragStateRef.current = null;
      setDraggingCircleId(null);
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleCircleClick = (circle: CircleSlot, index: number) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (isWiggling) {
      setIsWiggling(false);
      return;
    }
    const alreadyAdded = isPetAlreadyAdded(circle.pet);
    setActiveCircleId(circle.id);
    setCircles((prev) =>
      prev.map((c, idx) =>
        c.id === circle.id && !c.pet
          ? { ...c, pet: createEmptyPet(idx) }
          : c
      )
    );
    setShareConfig((prev) => ({
      ...prev,
      selectedSlots: prev.selectedSlots.includes(index)
        ? prev.selectedSlots
        : [index],
    }));
    setOpenSection('feeding');
    navigateToScreen(alreadyAdded ? 'pet-cards' : 'name-photo', 1);
  };

  const handleDeleteCircle = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    setCircles((prev) => {
      const next = prev.filter((c) => c.id !== idToDelete);
      if (next.length > 0 && activeCircleId === idToDelete) {
        setActiveCircleId(next[0].id);
      }
      return next.map((c, idx) => ({
        ...c,
        pet: c.pet ? { ...c.pet, slotIndex: idx } : null,
      }));
    });
  };

  const handleAddCircleBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCircles((prev) => {
      if (prev.length >= 5) return prev;
      const newCircle: CircleSlot = {
        id: `circle-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        pet: null,
      };
      return [...prev, newCircle];
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 320;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h >= w && h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          updateCurrentPet((prev) => ({ ...prev, photoUrl: dataUrl }));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleIncludedSection = (key: keyof IncludedSections) => {
    setShareConfig((prev) => ({
      ...prev,
      included: {
        ...prev.included,
        [key]: !prev.included[key],
      },
    }));
  };

  const toggleSelectedSlotForShare = (slotIdx: number) => {
    setShareConfig((prev) => {
      const exists = prev.selectedSlots.includes(slotIdx);
      if (exists && prev.selectedSlots.length === 1) return prev;
      const nextSlots = exists
        ? prev.selectedSlots.filter((s) => s !== slotIdx)
        : [...prev.selectedSlots, slotIdx];
      return { ...prev, selectedSlots: nextSlots };
    });
  };

  const filledPets: PetProfile[] = useMemo(
    () =>
      circles
        .map((c, idx) => (c.pet ? { ...c.pet, slotIndex: idx } : null))
        .filter(
          (p): p is PetProfile =>
            p !== null &&
            (Boolean(p.name.trim()) ||
              Boolean(p.photoUrl) ||
              Boolean(p.feeding.trim()) ||
              Boolean(p.meds.trim()) ||
              Boolean(p.walks.trim()) ||
              Boolean(p.quirks.trim()) ||
              Boolean(p.vetName.trim()))
        ),
    [circles]
  );

  const activeSharedPets: PetProfile[] = useMemo(() => {
    if (sharedSnapshot) return sharedSnapshot.pets;
    const selected = filledPets.filter((p) =>
      shareConfig.selectedSlots.includes(p.slotIndex)
    );
    return selected.length > 0 ? selected : [currentPet];
  }, [sharedSnapshot, filledPets, shareConfig.selectedSlots, currentPet]);

  const activeIncluded: IncludedSections = sharedSnapshot
    ? sharedSnapshot.included
    : shareConfig.included;

  const submitSitterCodeRequest = async (rotate: boolean) => {
    if (rotate) {
      setIsRotatingCode(true);
    } else {
      setIsGeneratingCode(true);
    }
    try {
      const snapshot: SharedSnapshot = {
        pets: activeSharedPets,
        included: shareConfig.included,
      };
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          code: generatedCode || undefined,
          editToken: generatedEditToken || undefined,
          rotate: rotate || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate sitter code');
      const data = (await res.json()) as {
        code: string;
        editToken?: string;
      };
      setGeneratedCode(data.code);
      if (data.editToken) {
        setGeneratedEditToken(data.editToken);
        try {
          localStorage.setItem(
            SITTER_AUTH_STORAGE_KEY,
            JSON.stringify({ code: data.code, editToken: data.editToken })
          );
        } catch {
          // ignore storage errors
        }
      }

      try {
        await navigator.clipboard.writeText(data.code);
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
      } catch {
        // ignore clipboard errors
      }
    } catch {
      // ignore network error
    } finally {
      setIsGeneratingCode(false);
      setIsRotatingCode(false);
    }
  };

  const handleGenerateSitterCode = () => submitSitterCodeRequest(false);
  const handleRotateSitterCode = () => submitSitterCodeRequest(true);

  const handleSaveBackupToPhone = () => {
    try {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        circles,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-pets-backup.backup';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setBackupStatusMessage('Saved a backup copy of your pets to this phone.');
      setTimeout(() => setBackupStatusMessage(''), 3500);
    } catch {
      setBackupStatusMessage('Could not save backup right now.');
    }
  };

  const handleRestorePetsFromPhone = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rawList = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.circles)
            ? parsed.circles
            : null;
        if (!rawList) {
          setBackupStatusMessage('That backup could not be opened.');
          return;
        }
        const restored: CircleSlot[] = [0, 1, 2, 3, 4].map((idx) => {
          const item = rawList[idx];
          return {
            id:
              typeof item?.id === 'string' && item.id.length <= 64
                ? item.id
                : `circle-${idx}`,
            pet: item?.pet ? sanitizePetProfile(item.pet, idx) : null,
          };
        });
        setCircles(restored);
        if (restored[0]?.id) setActiveCircleId(restored[0].id);
        setBackupStatusMessage('Your pets have been brought back!');
        setTimeout(() => setBackupStatusMessage(''), 3500);
      } catch {
        setBackupStatusMessage('That backup could not be opened.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyExistingCode = async () => {
    if (!generatedCode) return;
    const shareUrl = `${window.location.origin}/?code=${generatedCode}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Pet Care Card Sitter Code',
          text: `Use sitter code ${generatedCode} (or tap ${shareUrl}) to open the Pet Care Card for ${activeSharedPets
            .map((p) => p.name || 'my pet')
            .join(', ')}.`,
          url: shareUrl,
        });
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2500);
        return;
      } catch {
        // Fallback to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleLoadSitterCode = async () => {
    const cleanCode = sitterCodeInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!cleanCode) {
      setSitterCodeError('Please enter the 6-character code from the owner.');
      return;
    }
    setIsLoadingSitterCode(true);
    setSitterCodeError('');
    try {
      const res = await fetch(`/api/cards/${encodeURIComponent(cleanCode)}`);
      if (!res.ok) {
        if (cachedSitterCard && cachedSitterCard.code === cleanCode) {
          setSharedSnapshot(cachedSitterCard.snapshot);
          navigateToScreen('sitter-view', 1);
          return;
        }
        setSitterCodeError(
          'Code not found. Double-check the 6-character code from the owner.'
        );
        return;
      }
      const data = (await res.json()) as {
        code: string;
        snapshot: unknown;
      };
      const cleanSnapshot = sanitizeSnapshot(data?.snapshot);
      if (cleanSnapshot) {
        saveSitterCache(cleanCode, cleanSnapshot);
        setSharedSnapshot(cleanSnapshot);
        navigateToScreen('sitter-view', 1);
      } else {
        setSitterCodeError('Invalid card data received.');
      }
    } catch {
      if (cachedSitterCard && cachedSitterCard.code === cleanCode) {
        setSharedSnapshot(cachedSitterCard.snapshot);
        navigateToScreen('sitter-view', 1);
        return;
      }
      setSitterCodeError('Could not load code. Please try again.');
    } finally {
      setIsLoadingSitterCode(false);
    }
  };

  const showAddGhostCircle =
    (isWiggling || circles.length === 0) && circles.length < 5;
  const totalStageItems = circles.length + (showAddGhostCircle ? 1 : 0);
  const pawPositions = useMemo(
    () => getPawPositions(totalStageItems),
    [totalStageItems]
  );

  // Determine which circle occupies the large bottom paw pad (most recently viewed or slid into pad)
  const mainPadCircleId = useMemo(() => {
    const activeSlot = circles.find((c) => c.id === activeCircleId);
    if (activeSlot) {
      return activeSlot.id;
    }
    const firstFilled = circles.find((c) => isPetAlreadyAdded(c.pet));
    if (firstFilled) {
      return firstFilled.id;
    }
    return circles[0]?.id || '';
  }, [circles, activeCircleId]);

  const circleLayoutMap = useMemo(() => {
    const map = new Map<string, PawPosition>();
    let toeSlotIdx = 1;
    for (const circle of circles) {
      if (circle.id === mainPadCircleId) {
        map.set(
          circle.id,
          pawPositions[0] || { x: 0, y: 84, isMainPad: true }
        );
      } else {
        map.set(
          circle.id,
          pawPositions[toeSlotIdx] || { x: 0, y: 0, isMainPad: false }
        );
        toeSlotIdx += 1;
      }
    }
    return map;
  }, [circles, mainPadCircleId, pawPositions]);

  // Universal Bottom Arrow Navigation Bar rendered on EVERY screen
  const renderBottomNavArrows = () => {
    const prevLabel = prevScreenLabel();
    const nextLabel = nextScreenLabel();

    return (
      <div className="no-print pt-3.5 mt-3 border-t border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
        {canGoBack ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            onClick={handleGoBack}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-200/80 hover:bg-slate-300/80 text-slate-800 text-xs font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[115px]">
              {prevLabel || 'Back'}
            </span>
          </motion.button>
        ) : (
          <div />
        )}

        {canGoForward ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            onClick={handleGoForward}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-(--cs-accent) hover:bg-(--cs-accent-hover) text-(--cs-on-accent) text-xs font-medium transition-colors cursor-pointer ml-auto"
          >
            <span className="truncate max-w-[125px]">
              {nextLabel || 'Next'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </motion.button>
        ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 450, damping: 22 }}
            onClick={() => {
              setSharedSnapshot(null);
              navigateToScreen('role-select', -1);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-(--cs-accent) hover:bg-(--cs-accent-hover) text-(--cs-on-accent) text-xs font-medium transition-colors cursor-pointer ml-auto"
          >
            <span>Start screen</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </motion.button>
        )}
      </div>
    );
  };

  return (
    <div
      onKeyDown={handleFieldKeyDown}
      className="min-h-screen bg-(--cs-app-bg) flex flex-col items-center justify-center px-4 py-6 select-none sm:select-auto"
    >
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm w-full mb-3 rounded-xl max-w-[380px]">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {/* Shared hidden gallery input & hardware camera fallback input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoUpload}
        className="hidden"
      />
      <input
        ref={cameraCaptureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoUpload}
        className="hidden"
      />
      <input
        ref={backupFileInputRef}
        type="file"
        accept=".backup,.json,application/json"
        onChange={handleRestorePetsFromPhone}
        className="hidden"
      />

      {/* Top minimal step indicator & small arrow navigation */}
      <div className="no-print w-full max-w-[380px] flex items-center justify-between mb-3 px-1 text-(--cs-chrome-muted) text-xs">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              onClick={handleGoBack}
              aria-label="Previous screen"
              className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
          )}
          <span className="font-medium tracking-tight text-neutral-300">
            {SCREEN_LABELS[currentScreen]}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canGoForward && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.06 }}
              transition={{ type: 'spring', stiffness: 450, damping: 22 }}
              onClick={handleGoForward}
              aria-label="Next screen"
              className="w-8 h-8 rounded-full bg-(--cs-accent) hover:bg-(--cs-accent-hover) text-(--cs-on-accent) flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Main single-screen mobile card frame with 1-finger swipe & directional slide transitions */}
      <div
        onPointerDown={handleContainerPointerDown}
        onPointerUp={handleContainerPointerUp}
        className="print-container w-full max-w-[380px] min-h-[680px] bg-(--cs-card) rounded-[28px] shadow-2xl overflow-hidden flex flex-col relative text-slate-900 touch-pan-y"
      >
        <AnimatePresence
          mode="popLayout"
          initial={false}
          custom={navState.direction}
        >
          <motion.div
            key={currentScreen}
            custom={navState.direction}
            variants={pageSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageSpringTransition}
            className="flex-1 flex flex-col min-h-[680px] w-full"
          >
            {/* ============================================================
                SCREEN 0A: ROLE SELECT (Owner vs. Sitter beginning screen)
               ============================================================ */}
            {currentScreen === 'role-select' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                  <div className="text-center space-y-1.5">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      Pet Care Card
                    </h1>
                    <p className="text-xs text-slate-500">
                      Choose how you&apos;re using the app today
                    </p>
                  </div>

                  <div className="w-full space-y-3 pt-2">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 22,
                      }}
                      onClick={() => {
                        setSharedSnapshot(null);
                        navigateToScreen('start', 1);
                      }}
                      className="w-full p-4 rounded-2xl bg-accent-gradient hover:brightness-95 text-(--cs-on-accent) text-left shadow-md flex items-center gap-3.5 cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-(--cs-on-accent)" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold">
                          I&apos;m an Owner
                        </div>
                        <div className="text-xs text-(--cs-on-accent)/80 mt-0.5">
                          Create or update your pet&apos;s care card
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-(--cs-on-accent)/80 shrink-0" />
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 22,
                      }}
                      onClick={() => navigateToScreen('sitter-import', 1)}
                      className="w-full p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 text-slate-900 text-left shadow-xs flex items-center gap-3.5 cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-full bg-(--cs-accent)/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-(--cs-accent)" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-900">
                          I&apos;m a Sitter
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Enter the sitter code sent by the owner
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </motion.button>

                    {cachedSitterCard && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => {
                          setSharedSnapshot(cachedSitterCard.snapshot);
                          navigateToScreen('sitter-view', 1);
                        }}
                        className="w-full py-2.5 px-3.5 rounded-xl bg-(--cs-accent)/10 hover:bg-(--cs-accent)/15 border border-(--cs-accent)/25 text-(--cs-accent) text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">
                          Resume saved card:{' '}
                          {cachedSitterCard.snapshot.pets
                            .map((p) => p.name || 'Pet')
                            .join(', ')}{' '}
                          ({cachedSitterCard.code})
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      </motion.button>
                    )}
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 0B: SITTER IMPORT (Enter 6-character Sitter Code)
               ============================================================ */}
            {currentScreen === 'sitter-import' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Enter Sitter Code
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Type the 6-character code the owner sent you
                  </p>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-6">
                  <div className="w-14 h-14 rounded-full bg-(--cs-accent)/10 flex items-center justify-center text-(--cs-accent)">
                    <KeyRound className="w-6 h-6" />
                  </div>

                  <div className="w-full max-w-[260px] space-y-2">
                    <label className="block text-xs font-semibold text-slate-700 text-center">
                      Sitter Code
                    </label>
                    <input
                      type="text"
                      enterKeyHint="done"
                      maxLength={6}
                      value={sitterCodeInput}
                      onChange={(e) => {
                        setSitterCodeInput(filterSitterCodeInput(e.target.value));
                        if (sitterCodeError) setSitterCodeError('');
                      }}
                      placeholder="E.G. 7K4M9P"
                      className="w-full px-4 py-3 text-center text-lg font-mono font-bold tracking-[0.25em] uppercase bg-white border border-slate-200 rounded-2xl shadow-xs focus:outline-none focus:border-(--cs-accent)"
                    />
                    {sitterCodeError && (
                      <p className="text-xs text-red-600 text-center font-medium">
                        {sitterCodeError}
                      </p>
                    )}
                  </div>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    whileHover={{ scale: 1.02 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    disabled={isLoadingSitterCode}
                    onClick={handleLoadSitterCode}
                    className="w-full max-w-[260px] py-3 px-4 rounded-2xl bg-accent-gradient hover:brightness-95 disabled:opacity-60 text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <span>
                      {isLoadingSitterCode
                        ? 'Loading Pet Card...'
                        : 'Open Pet Card'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 1: THE PAW (Pet selection screen — 5 circles in a paw)
               ============================================================ */}
            {currentScreen === 'start' && (
              <div
                onClick={() => {
                  if (isWiggling && circles.length > 0) setIsWiggling(false);
                }}
                className="flex-1 flex flex-col justify-between p-6 relative"
              >
                {/* Reserved top margin for future App Name & Logo */}
                <div className="pt-8 min-h-[84px] flex flex-col items-center justify-end shrink-0">
                  <motion.h1
                    layout
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className="text-[22px] font-semibold tracking-tight text-(--cs-ink)"
                  >
                    Add a pet
                  </motion.h1>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
                  <div
                    data-no-swipe="true"
                    className="relative w-[336px] h-[380px] flex items-center justify-center touch-none"
                  >
                    <AnimatePresence initial={false}>
                      {circles.map((circle, idx) => {
                        const pos = circleLayoutMap.get(circle.id) || {
                          x: 0,
                          y: 0,
                          isMainPad: false,
                        };
                        const isMainPad = pos.isMainPad;
                        const sizePx = isMainPad ? 152 : 80;
                        const halfPx = sizePx / 2;
                        const slotPet = circle.pet;
                        const hasPhoto = Boolean(slotPet?.photoUrl);
                        const hasName = Boolean(slotPet?.name?.trim());
                        const isBeingDragged = draggingCircleId === circle.id;
                        const targetX =
                          pos.x + (isBeingDragged ? dragOffset.x : 0);
                        const targetY =
                          pos.y + (isBeingDragged ? dragOffset.y : 0);

                        return (
                          <motion.div
                            key={circle.id}
                            initial={{
                              scale: 0,
                              opacity: 0,
                              x: pos.x,
                              y: pos.y,
                            }}
                            animate={{
                              scale: isBeingDragged ? 1.08 : 1,
                              opacity: 1,
                              x: targetX,
                              y: targetY,
                            }}
                            exit={{
                              scale: 0,
                              opacity: 0,
                              transition: {
                                type: 'spring',
                                stiffness: 420,
                                damping: 26,
                              },
                            }}
                            transition={{
                              type: 'spring',
                              stiffness: isBeingDragged ? 520 : 300,
                              damping: isBeingDragged ? 32 : 24,
                              mass: isBeingDragged ? 0.6 : 0.85,
                            }}
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              width: sizePx,
                              height: sizePx,
                              marginTop: -halfPx,
                              marginLeft: -halfPx,
                              zIndex: isBeingDragged
                                ? 30
                                : isMainPad
                                ? 10
                                : 5,
                            }}
                          >
                            <div
                              className={`relative w-full h-full transition-[width,height] duration-200 ${
                                isWiggling && !isBeingDragged
                                  ? 'animate-wiggle'
                                  : ''
                              }`}
                              style={
                                isWiggling && !isBeingDragged
                                  ? { animationDelay: `${(idx % 3) * -0.07}s` }
                                  : undefined
                              }
                            >
                              <motion.button
                                type="button"
                                whileTap={
                                  isWiggling || isBeingDragged
                                    ? undefined
                                    : { scale: 0.92 }
                                }
                                whileHover={
                                  isWiggling || isBeingDragged
                                    ? undefined
                                    : { scale: 1.04 }
                                }
                                transition={{
                                  type: 'spring',
                                  stiffness: 420,
                                  damping: 20,
                                }}
                                onPointerDown={(e) =>
                                  handleCirclePointerDown(e, circle, pos)
                                }
                                onPointerMove={handleCirclePointerMove}
                                onPointerUp={handleCirclePointerUpOrLeave}
                                onPointerCancel={handleCirclePointerUpOrLeave}
                                onContextMenu={(e) => e.preventDefault()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCircleClick(circle, idx);
                                }}
                                aria-label={
                                  hasName
                                    ? `Open ${slotPet?.name}`
                                    : `Add pet in slot ${idx + 1}`
                                }
                                className="w-full h-full rounded-full bg-(--cs-accent) border-[4.5px] border-white shadow-[0_8px_22px_rgba(0,0,0,0.18)] flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing focus:outline-none touch-none"
                              >
                                {hasPhoto ? (
                                  <img
                                    src={slotPet!.photoUrl}
                                    alt={slotPet!.name || 'Pet photo'}
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover rounded-full pointer-events-none"
                                  />
                                ) : hasName ? (
                                  <span
                                    className={`px-2.5 font-semibold text-(--cs-on-accent) text-center leading-tight line-clamp-2 break-words pointer-events-none ${
                                      isMainPad ? 'text-base' : 'text-xs'
                                    }`}
                                  >
                                    {slotPet!.name}
                                  </span>
                                ) : (
                                  <Plus
                                    className={`${
                                      isMainPad ? 'w-12 h-12' : 'w-7 h-7'
                                    } text-(--cs-on-accent) stroke-[2.2] pointer-events-none`}
                                  />
                                )}
                              </motion.button>

                              <AnimatePresence>
                                {isWiggling && (
                                  <>
                                    <motion.button
                                      key={`delete-${circle.id}`}
                                      type="button"
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      exit={{ scale: 0, opacity: 0 }}
                                      whileTap={{ scale: 0.85 }}
                                      transition={{
                                        type: 'spring',
                                        stiffness: 480,
                                        damping: 22,
                                      }}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      onClick={(e) =>
                                        handleDeleteCircle(e, circle.id)
                                      }
                                      aria-label={`Delete circle ${idx + 1}`}
                                      className="absolute -top-1 -left-1 w-[28px] h-[28px] rounded-full bg-(--cs-danger) border-[3px] border-white shadow-[0_3px_8px_rgba(0,0,0,0.22)] flex items-center justify-center cursor-pointer z-10 focus:outline-none"
                                    >
                                      <span className="w-3 h-[2.5px] bg-white rounded-full block" />
                                    </motion.button>

                                    {(hasName || hasPhoto) && (
                                      <motion.button
                                        key={`camera-${circle.id}`}
                                        type="button"
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        whileTap={{ scale: 0.85 }}
                                        transition={{
                                          type: 'spring',
                                          stiffness: 480,
                                          damping: 22,
                                        }}
                                        onPointerDown={(e) =>
                                          e.stopPropagation()
                                        }
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveCircleId(circle.id);
                                          openPhotoSourceMenu();
                                        }}
                                        aria-label={`Add photo for ${
                                          slotPet?.name || `pet ${idx + 1}`
                                        }`}
                                        className="absolute -top-1 -right-1 w-[28px] h-[28px] rounded-full bg-(--cs-accent) border-[3px] border-white shadow-[0_3px_8px_rgba(0,0,0,0.22)] flex items-center justify-center cursor-pointer z-10 focus:outline-none"
                                      >
                                        <Camera className="w-3.5 h-3.5 text-(--cs-on-accent) stroke-[2.2]" />
                                      </motion.button>
                                    )}
                                  </>
                                )}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        );
                      })}

                      {showAddGhostCircle && (
                        <motion.div
                          key="ghost-add-circle"
                          initial={{
                            scale: 0,
                            opacity: 0,
                            x: pawPositions[circles.length]?.x || 0,
                            y: pawPositions[circles.length]?.y || 0,
                          }}
                          animate={{
                            scale: 1,
                            opacity: 0.48,
                            x: pawPositions[circles.length]?.x || 0,
                            y: pawPositions[circles.length]?.y || 0,
                          }}
                          exit={{
                            scale: 0,
                            opacity: 0,
                            transition: {
                              type: 'spring',
                              stiffness: 420,
                              damping: 26,
                            },
                          }}
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 24,
                            mass: 0.85,
                          }}
                          style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: pawPositions[circles.length]?.isMainPad
                              ? 152
                              : 80,
                            height: pawPositions[circles.length]?.isMainPad
                              ? 152
                              : 80,
                            marginTop: pawPositions[circles.length]?.isMainPad
                              ? -76
                              : -40,
                            marginLeft: pawPositions[circles.length]?.isMainPad
                              ? -76
                              : -40,
                          }}
                        >
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.88 }}
                            whileHover={{ scale: 1.06 }}
                            transition={{
                              type: 'spring',
                              stiffness: 420,
                              damping: 20,
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={handleAddCircleBack}
                            aria-label="Add circle slot"
                            className="w-full h-full rounded-full bg-(--cs-accent) border-[4.5px] border-white shadow-[0_8px_22px_rgba(0,0,0,0.16)] flex items-center justify-center cursor-pointer focus:outline-none"
                          >
                            <Plus className="w-7 h-7 text-(--cs-on-accent) stroke-[2.2] pointer-events-none" />
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 2: PET NAME & PICTURE (Focused 1-step-at-a-time screen)
               ============================================================ */}
            {currentScreen === 'name-photo' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Pet name &amp; picture
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Add your pet&apos;s photo and name to get started
                  </p>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-6">
                  <div className="flex flex-col items-center gap-2.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      whileHover={{ scale: 1.04 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 22,
                      }}
                      onClick={openPhotoSourceMenu}
                      className="w-28 h-28 rounded-full bg-(--cs-accent) border-[4px] border-white shadow-[0_8px_22px_rgba(0,0,0,0.16)] flex flex-col items-center justify-center text-(--cs-on-accent) overflow-hidden cursor-pointer focus:outline-none"
                    >
                      {currentPet.photoUrl ? (
                        <img
                          src={currentPet.photoUrl}
                          alt={currentPet.name || 'Pet'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <Camera className="w-8 h-8 mb-1 stroke-[2]" />
                          <span className="text-xs font-medium">
                            Add photo
                          </span>
                        </>
                      )}
                    </motion.button>

                    {currentPet.photoUrl && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={openPhotoSourceMenu}
                          className="text-xs font-medium text-(--cs-accent) hover:underline cursor-pointer"
                        >
                          Change photo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCurrentPet((p) => ({ ...p, photoUrl: '' }))
                          }
                          className="text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="w-full max-w-[260px] space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 text-center">
                      Pet&apos;s name
                    </label>
                    <input
                      type="text"
                      enterKeyHint="done"
                      value={currentPet.name}
                      onChange={(e) =>
                        updateCurrentPet((p) => ({
                          ...p,
                          name: filterNameInput(e.target.value),
                        }))
                      }
                      placeholder="Enter pet name"
                      className="w-full px-4 py-2.5 text-center text-base font-semibold bg-white border border-slate-200 rounded-2xl shadow-xs focus:outline-none focus:border-(--cs-accent)"
                    />
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 3: PET CARDS (Unified Pet Card + Edit Card in one screen)
               ============================================================ */}
            {currentScreen === 'pet-cards' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="space-y-3 overflow-y-auto pr-0.5">
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">
                      Pet cards
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Saved only on this phone · Tap any field to edit
                    </p>
                  </div>

                  {/* Active Pet Card Header — Photo, Name, Age, Breed, Weight + lbs/oz */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5">
                    <div className="flex items-center gap-3">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={openPhotoSourceMenu}
                        title="Change pet photo"
                        className="w-16 h-16 rounded-full bg-(--cs-accent) border-2 border-white shadow-sm flex flex-col items-center justify-center text-(--cs-on-accent) overflow-hidden shrink-0 cursor-pointer"
                      >
                        {currentPet.photoUrl ? (
                          <img
                            src={currentPet.photoUrl}
                            alt={currentPet.name || 'Pet'}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <>
                            <Camera className="w-5 h-5 text-(--cs-on-accent)" />
                            <span className="text-[10px] mt-0.5">Photo</span>
                          </>
                        )}
                      </motion.button>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          type="text"
                          enterKeyHint="done"
                          value={currentPet.name}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              name: filterNameInput(e.target.value),
                            }))
                          }
                          placeholder="Pet name"
                          className="w-full px-2.5 py-1 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                        />
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="text"
                            enterKeyHint="done"
                            value={currentPet.age}
                            onChange={(e) =>
                              updateCurrentPet((p) => ({
                                ...p,
                                age: filterAgeInput(e.target.value),
                              }))
                            }
                            placeholder="Age"
                            className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-(--cs-accent)"
                          />
                          <input
                            type="text"
                            enterKeyHint="done"
                            value={currentPet.breed}
                            onChange={(e) =>
                              updateCurrentPet((p) => ({
                                ...p,
                                breed: filterNameInput(e.target.value),
                              }))
                            }
                            placeholder="Breed"
                            className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-(--cs-accent)"
                          />
                          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden focus-within:border-(--cs-accent)">
                            <input
                              type="text"
                              inputMode="decimal"
                              enterKeyHint="done"
                              value={currentPet.weightLbs}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  weightLbs: filterWeightInput(e.target.value),
                                }))
                              }
                              placeholder="Wt"
                              className="w-full min-w-0 px-1.5 py-1 text-[11px] font-mono bg-transparent focus:outline-none"
                            />
                            <select
                              value={currentPet.weightUnit || 'lbs'}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  weightUnit: e.target.value as WeightUnit,
                                }))
                              }
                              aria-label="Weight unit"
                              className="pr-1 py-1 text-[10px] font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                            >
                              <option value="lbs">lbs</option>
                              <option value="oz">oz</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-0.5">
                          <select
                            value={currentPet.sexStatus}
                            onChange={(e) =>
                              updateCurrentPet((p) => ({
                                ...p,
                                sexStatus: e.target.value as SexStatus,
                              }))
                            }
                            aria-label="Sex and spay/neuter status"
                            className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer focus:outline-none focus:border-(--cs-accent) ${
                              currentPet.sexStatus
                                ? 'bg-(--cs-accent)/10 text-(--cs-accent) border-(--cs-accent)/30'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <option value="">Sex / Spay-Neuter</option>
                            <option value="M-Neutered">M-Neutered</option>
                            <option value="M-Intact">M-Intact</option>
                            <option value="F-Spayed">F-Spayed</option>
                            <option value="F-Intact">F-Intact</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Household slot switcher */}
                  {filledPets.length > 1 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-600">
                        Household pets
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        {filledPets.map((pet) => {
                          const cId = circles[pet.slotIndex]?.id;
                          const isSelected = pet.slotIndex === activeIndex;
                          const label = pet.name.trim() || `Pet ${pet.slotIndex + 1}`;
                          return (
                            <motion.button
                              key={pet.slotIndex}
                              type="button"
                              whileTap={{ scale: 0.92 }}
                              onClick={() => {
                                if (cId) setActiveCircleId(cId);
                              }}
                              aria-label={`Select ${label}`}
                              title={label}
                              className={`w-12 h-12 rounded-full bg-(--cs-accent) border-2 border-white shadow-sm flex items-center justify-center overflow-hidden shrink-0 transition-all cursor-pointer focus:outline-none ${
                                isSelected
                                  ? 'ring-2 ring-(--cs-accent) ring-offset-2 scale-105'
                                  : 'opacity-75 hover:opacity-100'
                              }`}
                            >
                              {pet.photoUrl ? (
                                <img
                                  src={pet.photoUrl}
                                  alt={label}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover rounded-full"
                                />
                              ) : (
                                <span className="px-1 text-[10px] font-semibold text-(--cs-on-accent) text-center leading-tight line-clamp-2 break-words">
                                  {label}
                                </span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 1. Feeding section (OPEN BY DEFAULT) */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(
                          openSection === 'feeding' ? null : 'feeding'
                        )
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Feeding
                      </span>
                      <motion.span
                        animate={{
                          rotate: openSection === 'feeding' ? 180 : 0,
                        }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'feeding' && (
                        <motion.div
                          key="feeding-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5">
                            <textarea
                              rows={3}
                              enterKeyHint="done"
                              value={currentPet.feeding}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  feeding: e.target.value,
                                }))
                              }
                              placeholder="Enter feeding schedule, portion sizes, and allergies"
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-(--cs-accent)"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 2. Meds */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(openSection === 'meds' ? null : 'meds')
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Meds
                      </span>
                      <motion.span
                        animate={{ rotate: openSection === 'meds' ? 180 : 0 }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'meds' && (
                        <motion.div
                          key="meds-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5">
                            <textarea
                              rows={2}
                              enterKeyHint="done"
                              value={currentPet.meds}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  meds: e.target.value,
                                }))
                              }
                              placeholder="Enter medications, dosage, and how to give them"
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-(--cs-accent)"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 3. Walks */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(openSection === 'walks' ? null : 'walks')
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Walks
                      </span>
                      <motion.span
                        animate={{ rotate: openSection === 'walks' ? 180 : 0 }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'walks' && (
                        <motion.div
                          key="walks-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5">
                            <textarea
                              rows={2}
                              enterKeyHint="done"
                              value={currentPet.walks}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  walks: e.target.value,
                                }))
                              }
                              placeholder="Enter walk schedule, harness/leash notes, and triggers"
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-(--cs-accent)"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 4. Quirks */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(
                          openSection === 'quirks' ? null : 'quirks'
                        )
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Quirks
                      </span>
                      <motion.span
                        animate={{
                          rotate: openSection === 'quirks' ? 180 : 0,
                        }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'quirks' && (
                        <motion.div
                          key="quirks-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5">
                            <textarea
                              rows={2}
                              enterKeyHint="done"
                              value={currentPet.quirks}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  quirks: e.target.value,
                                }))
                              }
                              placeholder="Enter habits, fears, and what calms your pet down"
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-(--cs-accent)"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 5. Vet & Emergency Info */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(openSection === 'vet' ? null : 'vet')
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Vet &amp; Emergency Info
                      </span>
                      <motion.span
                        animate={{ rotate: openSection === 'vet' ? 180 : 0 }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'vet' && (
                        <motion.div
                          key="vet-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5 space-y-2">
                            {(() => {
                              const donorPet = filledPets.find(
                                (p) =>
                                  p.slotIndex !== activeIndex &&
                                  (Boolean(p.vetName.trim()) ||
                                    Boolean(p.vetPhone.trim()) ||
                                    Boolean(p.erHospital.trim()) ||
                                    Boolean(p.ownerPhone.trim()) ||
                                    Boolean(p.backupContactPhone.trim()))
                              );
                              if (!donorPet) return null;
                              return (
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() =>
                                    updateCurrentPet((p) => ({
                                      ...p,
                                      vetName: donorPet.vetName || p.vetName,
                                      vetPhone: donorPet.vetPhone || p.vetPhone,
                                      erHospital:
                                        donorPet.erHospital || p.erHospital,
                                      ownerPhone:
                                        donorPet.ownerPhone || p.ownerPhone,
                                      backupContactName:
                                        donorPet.backupContactName ||
                                        p.backupContactName,
                                      backupContactPhone:
                                        donorPet.backupContactPhone ||
                                        p.backupContactPhone,
                                      emergencyAuth:
                                        donorPet.emergencyAuth ||
                                        p.emergencyAuth,
                                    }))
                                  }
                                  className="w-full py-1.5 px-2.5 rounded-lg bg-(--cs-accent)/10 hover:bg-(--cs-accent)/15 border border-(--cs-accent)/25 text-(--cs-accent) text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>
                                    Copy Vet &amp; Emergency info from{' '}
                                    {donorPet.name ||
                                      `Pet ${donorPet.slotIndex + 1}`}
                                  </span>
                                </motion.button>
                              );
                            })()}
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                enterKeyHint="done"
                                value={currentPet.vetName}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    vetName: e.target.value,
                                  }))
                                }
                                placeholder="Vet name"
                                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={14}
                                enterKeyHint="done"
                                value={currentPet.vetPhone}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    vetPhone: formatPhone10Digits(e.target.value),
                                  }))
                                }
                                placeholder="(555) 123-4567"
                                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                            </div>
                            <input
                              type="text"
                              enterKeyHint="done"
                              value={currentPet.erHospital}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  erHospital: e.target.value,
                                }))
                              }
                              placeholder="After-hours ER clinic"
                              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={14}
                                enterKeyHint="done"
                                value={currentPet.ownerPhone}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    ownerPhone: formatPhone10Digits(e.target.value),
                                  }))
                                }
                                placeholder="(555) 123-4567"
                                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                              <input
                                type="text"
                                maxLength={15}
                                enterKeyHint="done"
                                value={currentPet.chipNumber}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    chipNumber: filterChipInput(e.target.value),
                                  }))
                                }
                                placeholder="Chip number"
                                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                enterKeyHint="done"
                                value={currentPet.backupContactName}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    backupContactName: filterNameInput(
                                      e.target.value
                                    ),
                                  }))
                                }
                                placeholder="Backup contact name"
                                className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={14}
                                enterKeyHint="done"
                                value={currentPet.backupContactPhone}
                                onChange={(e) =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    backupContactPhone: formatPhone10Digits(
                                      e.target.value
                                    ),
                                  }))
                                }
                                placeholder="(555) 123-4567"
                                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                            </div>
                            <textarea
                              rows={2}
                              enterKeyHint="done"
                              value={currentPet.emergencyAuth}
                              onChange={(e) =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  emergencyAuth: e.target.value,
                                }))
                              }
                              placeholder="If something's wrong (emergency authorization instructions)"
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-(--cs-accent)"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* 6. Vaccines & Reminders */}
                  <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSection(
                          openSection === 'vaccines' ? null : 'vaccines'
                        )
                      }
                      className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">
                        Vaccines &amp; Reminders
                      </span>
                      <motion.span
                        animate={{
                          rotate: openSection === 'vaccines' ? 180 : 0,
                        }}
                        transition={dropdownSpringTransition}
                      >
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {openSection === 'vaccines' && (
                        <motion.div
                          key="vaccines-body"
                          initial={{ height: 0, opacity: 0, y: -6 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -6 }}
                          transition={dropdownSpringTransition}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3.5 space-y-2.5">
                            {currentPet.vaccines.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                Tap &ldquo;+ Add vaccine&rdquo; below to track vaccine expiration dates.
                              </p>
                            ) : (
                              currentPet.vaccines.map((vax, idx) => {
                                const days = getDaysUntil(vax.expiresAt);
                                const isSoon = days !== null && days <= 45;
                                return (
                                  <div
                                    key={vax.id}
                                    className="space-y-1 pb-2 border-b border-slate-100 last:border-0 last:pb-0"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        enterKeyHint="done"
                                        value={vax.name}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          updateCurrentPet((p) => {
                                            const next = [...p.vaccines];
                                            next[idx] = {
                                              ...next[idx],
                                              name: val,
                                            };
                                            return { ...p, vaccines: next };
                                          });
                                        }}
                                        placeholder="Vaccine name"
                                        className="flex-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                      />
                                      <input
                                        type="date"
                                        value={vax.expiresAt}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          updateCurrentPet((p) => {
                                            const next = [...p.vaccines];
                                            next[idx] = {
                                              ...next[idx],
                                              expiresAt: val,
                                            };
                                            return { ...p, vaccines: next };
                                          });
                                        }}
                                        className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateCurrentPet((p) => ({
                                            ...p,
                                            vaccines: p.vaccines.filter(
                                              (_, i) => i !== idx
                                            ),
                                          }))
                                        }
                                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                        aria-label="Remove vaccine"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    {days !== null && (
                                      <div
                                        className={`text-[11px] font-mono ${
                                          isSoon
                                            ? 'text-amber-700 font-semibold'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        {days >= 0
                                          ? `Expires in ${days} day${days === 1 ? '' : 's'}`
                                          : `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentPet((p) => ({
                                  ...p,
                                  vaccines: [
                                    ...p.vaccines,
                                    {
                                      id: `v-${Date.now()}`,
                                      name: '',
                                      dateGiven: '',
                                      expiresAt: '',
                                    },
                                  ],
                                }))
                              }
                              className="text-xs font-semibold text-(--cs-accent) hover:underline cursor-pointer"
                            >
                              + Add vaccine
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Dedicated screens for Vet visit & Lost pet flyer */}
                  <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => navigateToScreen('vet-visit', 1)}
                      className="p-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Vet visit
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Vaccines &amp; weight history
                      </div>
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => navigateToScreen('lost-flyer', 1)}
                      className="p-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900">
                        Lost pet flyer
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Photo, chip &amp; phone
                      </div>
                    </motion.button>
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 4: VET VISIT (Vaccine & weight info — editable in-place + bottom arrows)
               ============================================================ */}
            {currentScreen === 'vet-visit' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="space-y-4 overflow-y-auto pr-0.5">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
                    <div>
                      <h1 className="text-lg font-bold text-slate-900">
                        Vaccine &amp; weight info
                      </h1>
                      <p className="text-xs text-slate-500">
                        Edit records directly on this screen
                      </p>
                    </div>
                  </div>

                  {/* Pet name & current weight editable in-place with lbs/oz dropdown */}
                  <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-2xl border border-slate-200">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Pet name
                      </label>
                      <input
                        type="text"
                        enterKeyHint="done"
                        value={currentPet.name}
                        onChange={(e) =>
                          updateCurrentPet((p) => ({
                            ...p,
                            name: filterNameInput(e.target.value),
                          }))
                        }
                        placeholder="Pet name"
                        className="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        Current weight{' '}
                        {currentPet.weightLbs.trim() && (
                          <span className="font-mono text-slate-400">
                            (
                            {formatWeightWithKg(
                              currentPet.weightLbs,
                              currentPet.weightUnit || 'lbs'
                            )
                              .split('(')[1]
                              ?.replace(')', '') || ''}
                            )
                          </span>
                        )}
                      </label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:border-(--cs-accent)">
                        <input
                          type="text"
                          inputMode="decimal"
                          enterKeyHint="done"
                          value={currentPet.weightLbs}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              weightLbs: filterWeightInput(e.target.value),
                            }))
                          }
                          placeholder="Weight"
                          className="w-full min-w-0 px-2.5 py-1.5 text-xs font-mono bg-transparent focus:outline-none"
                        />
                        <select
                          value={currentPet.weightUnit || 'lbs'}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              weightUnit: e.target.value as WeightUnit,
                            }))
                          }
                          aria-label="Current weight unit"
                          className="pr-2 py-1.5 text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                        >
                          <option value="lbs">lbs</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Vaccine Dates — editable in-place */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold text-slate-900">
                        Vaccine Dates
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentPet((p) => ({
                            ...p,
                            vaccines: [
                              ...p.vaccines,
                              {
                                id: `v-${Date.now()}`,
                                name: '',
                                dateGiven: '',
                                expiresAt: '',
                              },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-(--cs-accent) hover:underline cursor-pointer"
                      >
                        + Add vaccine
                      </button>
                    </div>

                    {currentPet.vaccines.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No vaccine records yet. Tap &ldquo;+ Add vaccine&rdquo; above.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {currentPet.vaccines.map((v, idx) => (
                          <div
                            key={v.id}
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                enterKeyHint="done"
                                value={v.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCurrentPet((p) => {
                                    const next = [...p.vaccines];
                                    next[idx] = { ...next[idx], name: val };
                                    return { ...p, vaccines: next };
                                  });
                                }}
                                placeholder="Vaccine name"
                                className="flex-1 px-2 py-1 text-xs font-medium bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    vaccines: p.vaccines.filter(
                                      (_, i) => i !== idx
                                    ),
                                  }))
                                }
                                className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                aria-label="Remove vaccine"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                              <div>
                                <span className="text-slate-500 block mb-0.5">
                                  Date given
                                </span>
                                <input
                                  type="date"
                                  value={v.dateGiven}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateCurrentPet((p) => {
                                      const next = [...p.vaccines];
                                      next[idx] = {
                                        ...next[idx],
                                        dateGiven: val,
                                      };
                                      return { ...p, vaccines: next };
                                    });
                                  }}
                                  className="w-full px-2 py-1 font-mono bg-white border border-slate-200 rounded-lg"
                                />
                              </div>
                              <div>
                                <span className="text-slate-500 block mb-0.5">
                                  Expires
                                </span>
                                <input
                                  type="date"
                                  value={v.expiresAt}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateCurrentPet((p) => {
                                      const next = [...p.vaccines];
                                      next[idx] = {
                                        ...next[idx],
                                        expiresAt: val,
                                      };
                                      return { ...p, vaccines: next };
                                    });
                                  }}
                                  className="w-full px-2 py-1 font-mono bg-white border border-slate-200 rounded-lg"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Weight History — editable in-place with lbs/oz dropdown + auto kg conversion */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold text-slate-900">
                        Weight History
                      </h2>
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentPet((p) => ({
                            ...p,
                            weightHistory: [
                              ...p.weightHistory,
                              {
                                id: `w-${Date.now()}`,
                                date: new Date().toISOString().slice(0, 10),
                                weightLbs: p.weightLbs || '',
                                weightUnit: p.weightUnit || 'lbs',
                              },
                            ],
                          }))
                        }
                        className="text-xs font-semibold text-(--cs-accent) hover:underline cursor-pointer"
                      >
                        + Add weight entry
                      </button>
                    </div>

                    {currentPet.weightHistory.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No weight history logged yet. Tap &ldquo;+ Add weight entry&rdquo; above.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {currentPet.weightHistory.map((w, idx) => {
                          const unit =
                            w.weightUnit || currentPet.weightUnit || 'lbs';
                          const kgPart = formatWeightWithKg(w.weightLbs, unit)
                            .split('(')[1]
                            ?.replace(')', '');
                          return (
                            <div
                              key={w.id}
                              className="flex items-center gap-1.5"
                            >
                              <input
                                type="date"
                                value={w.date}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCurrentPet((p) => {
                                    const next = [...p.weightHistory];
                                    next[idx] = { ...next[idx], date: val };
                                    return { ...p, weightHistory: next };
                                  });
                                }}
                                className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                              />
                              <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:border-(--cs-accent)">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  enterKeyHint="done"
                                  value={w.weightLbs}
                                  onChange={(e) => {
                                    const val = filterWeightInput(e.target.value);
                                    updateCurrentPet((p) => {
                                      const next = [...p.weightHistory];
                                      next[idx] = {
                                        ...next[idx],
                                        weightLbs: val,
                                      };
                                      return { ...p, weightHistory: next };
                                    });
                                  }}
                                  placeholder="Weight"
                                  className="w-full min-w-0 px-2 py-1 text-xs font-mono bg-transparent focus:outline-none"
                                />
                                {kgPart && (
                                  <span className="text-[10px] font-mono text-slate-400 pr-1 shrink-0">
                                    ({kgPart})
                                  </span>
                                )}
                                <select
                                  value={unit}
                                  onChange={(e) => {
                                    const nextUnit = e.target
                                      .value as WeightUnit;
                                    updateCurrentPet((p) => {
                                      const next = [...p.weightHistory];
                                      next[idx] = {
                                        ...next[idx],
                                        weightUnit: nextUnit,
                                      };
                                      return { ...p, weightHistory: next };
                                    });
                                  }}
                                  aria-label="Weight entry unit"
                                  className="pr-1.5 py-1 text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                                >
                                  <option value="lbs">lbs</option>
                                  <option value="oz">oz</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCurrentPet((p) => ({
                                    ...p,
                                    weightHistory: p.weightHistory.filter(
                                      (_, i) => i !== idx
                                    ),
                                  }))
                                }
                                className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                aria-label="Remove weight entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 5: LOST PET FLYER (Editable in-place + bottom arrows)
               ============================================================ */}
            {currentScreen === 'lost-flyer' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="space-y-3 overflow-y-auto pr-0.5">
                  <div className="no-print flex items-center justify-between pb-2.5 border-b border-slate-200">
                    <div>
                      <h1 className="text-lg font-bold text-slate-900">
                        Lost Pet Flyer
                      </h1>
                      <p className="text-xs text-slate-500">
                        Edit any field directly on the flyer
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => window.print()}
                      className="px-3 py-1.5 rounded-xl bg-accent-gradient text-(--cs-on-accent) text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print
                    </motion.button>
                  </div>

                  <div className="bg-white border-2 border-red-600 rounded-2xl p-4 text-center space-y-3">
                    <div className="text-xl font-bold tracking-tight text-red-600">
                      LOST PET
                    </div>

                    <CrossStreetMapPicker
                      value={currentPet.lastSeenLocation}
                      lat={currentPet.lastSeenLat}
                      lng={currentPet.lastSeenLng}
                      onChange={({ locationText, lat, lng }) =>
                        updateCurrentPet((p) => ({
                          ...p,
                          lastSeenLocation: locationText,
                          lastSeenLat: lat,
                          lastSeenLng: lng,
                        }))
                      }
                    />

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={openPhotoSourceMenu}
                      title="Click to upload or change photo"
                      className="w-28 h-28 rounded-full bg-(--cs-accent) text-(--cs-on-accent) flex flex-col items-center justify-center mx-auto overflow-hidden border-2 border-slate-200 cursor-pointer"
                    >
                      {currentPet.photoUrl ? (
                        <img
                          src={currentPet.photoUrl}
                          alt={currentPet.name || 'Pet'}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 mb-1" />
                          <span className="text-[11px] font-medium">
                            Add Photo
                          </span>
                        </>
                      )}
                    </motion.button>

                    <div className="space-y-1.5">
                      <input
                        type="text"
                        enterKeyHint="done"
                        value={currentPet.name}
                        onChange={(e) =>
                          updateCurrentPet((p) => ({
                            ...p,
                            name: filterNameInput(e.target.value),
                          }))
                        }
                        placeholder="Pet name"
                        className="w-full px-2.5 py-1 text-center text-base font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="text"
                          enterKeyHint="done"
                          value={currentPet.age}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              age: filterAgeInput(e.target.value),
                            }))
                          }
                          placeholder="Age"
                          className="px-2 py-1 text-center text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                        />
                        <input
                          type="text"
                          enterKeyHint="done"
                          value={currentPet.breed}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              breed: filterNameInput(e.target.value),
                            }))
                          }
                          placeholder="Breed"
                          className="px-2 py-1 text-center text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                        />
                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden focus-within:border-(--cs-accent)">
                          <input
                            type="text"
                            inputMode="decimal"
                            enterKeyHint="done"
                            value={currentPet.weightLbs}
                            onChange={(e) =>
                              updateCurrentPet((p) => ({
                                ...p,
                                weightLbs: filterWeightInput(e.target.value),
                              }))
                            }
                            placeholder="Wt"
                            className="w-full min-w-0 px-1.5 py-1 text-center text-xs font-mono bg-transparent focus:outline-none"
                          />
                          <select
                            value={currentPet.weightUnit || 'lbs'}
                            onChange={(e) =>
                              updateCurrentPet((p) => ({
                                ...p,
                                weightUnit: e.target.value as WeightUnit,
                              }))
                            }
                            aria-label="Weight unit"
                            className="pr-1 py-1 text-[10px] font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                          >
                            <option value="lbs">lbs</option>
                            <option value="oz">oz</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-center pt-0.5">
                        <select
                          value={currentPet.sexStatus}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              sexStatus: e.target.value as SexStatus,
                            }))
                          }
                          aria-label="Sex and spay/neuter status"
                          className={`px-3 py-0.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer focus:outline-none focus:border-(--cs-accent) ${
                            currentPet.sexStatus
                              ? 'bg-(--cs-accent)/10 text-(--cs-accent) border-(--cs-accent)/30'
                              : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                        >
                          <option value="">Sex / Spay-Neuter</option>
                          <option value="M-Neutered">M-Neutered</option>
                          <option value="M-Intact">M-Intact</option>
                          <option value="F-Spayed">F-Spayed</option>
                          <option value="F-Intact">F-Intact</option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      enterKeyHint="done"
                      value={currentPet.quirks}
                      onChange={(e) =>
                        updateCurrentPet((p) => ({
                          ...p,
                          quirks: e.target.value,
                        }))
                      }
                      placeholder="Identifying details, collar, or temperament notes"
                      className="w-full p-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                    />

                    <div className="pt-2 border-t border-slate-200 text-xs space-y-2 font-mono text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 shrink-0">
                          Microchip:
                        </span>
                        <input
                          type="text"
                          maxLength={15}
                          enterKeyHint="done"
                          value={currentPet.chipNumber}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              chipNumber: filterChipInput(e.target.value),
                            }))
                          }
                          placeholder="Enter chip number"
                          className="flex-1 px-2 py-1 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-bold shrink-0">
                          Call Owner:
                        </span>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={14}
                          enterKeyHint="done"
                          value={currentPet.ownerPhone}
                          onChange={(e) =>
                            updateCurrentPet((p) => ({
                              ...p,
                              ownerPhone: formatPhone10Digits(e.target.value),
                            }))
                          }
                          placeholder="(555) 123-4567"
                          className="flex-1 px-2 py-1 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                        />
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        updateCurrentPet((p) => ({
                          ...p,
                          doNotChase: !p.doNotChase,
                        }))
                      }
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold tracking-wide uppercase transition-colors cursor-pointer ${
                        currentPet.doNotChase
                          ? 'bg-red-600 text-(--cs-on-accent) shadow-xs'
                          : 'bg-slate-100 text-slate-500 border border-dashed border-slate-300'
                      }`}
                    >
                      {currentPet.doNotChase
                        ? '⚠️ DO NOT CHASE — CALL IMMEDIATELY'
                        : '+ Tap to add "Do Not Chase" warning banner'}
                    </motion.button>
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 7: SHARE
               ============================================================ */}
            {currentScreen === 'share' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="space-y-4 overflow-y-auto pr-0.5">
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">Share</h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                      One universal card for anyone watching your pet
                    </p>
                  </div>

                  {filledPets.length > 1 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-slate-700">
                        Pets on this card
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {filledPets.map((pet) => {
                          const selected = shareConfig.selectedSlots.includes(
                            pet.slotIndex
                          );
                          return (
                            <motion.button
                              key={pet.slotIndex}
                              type="button"
                              whileTap={{ scale: 0.94 }}
                              onClick={() =>
                                toggleSelectedSlotForShare(pet.slotIndex)
                              }
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                                selected
                                  ? 'bg-(--cs-accent) text-(--cs-on-accent) border-(--cs-accent)'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {pet.name || `Pet ${pet.slotIndex + 1}`}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">
                      What to include
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                      {(
                        [
                          { key: 'feeding', label: 'Feeding instructions' },
                          { key: 'meds', label: 'Meds' },
                          { key: 'walks', label: 'Walks' },
                          { key: 'quirks', label: 'Quirks' },
                          { key: 'vet', label: 'Vet & after-hours ER' },
                          {
                            key: 'emergencyAuth',
                            label: "If something's wrong ($ auth)",
                          },
                          {
                            key: 'vaccines',
                            label: 'Vaccine records attached',
                          },
                        ] as const
                      ).map((row) => (
                        <label
                          key={row.key}
                          className="flex items-center justify-between px-3.5 py-2.5 text-xs text-slate-800 cursor-pointer"
                        >
                          <span>{row.label}</span>
                          <input
                            type="checkbox"
                            checked={shareConfig.included[row.key]}
                            onChange={() => toggleIncludedSection(row.key)}
                            className="w-4 h-4 accent-(--cs-accent) rounded cursor-pointer"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {generatedCode && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 26,
                        }}
                        className="p-3.5 rounded-2xl bg-white border-2 border-(--cs-accent) space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-medium text-slate-500">
                              Sitter Code (no login needed)
                            </div>
                            <div className="text-lg font-mono font-bold tracking-[0.22em] text-slate-900">
                              {generatedCode}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.94 }}
                              onClick={handleCopyExistingCode}
                              className="px-3 py-2 rounded-xl bg-(--cs-accent)/10 hover:bg-(--cs-accent)/20 text-(--cs-accent) text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                            >
                              {copiedCode ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  Share
                                </>
                              )}
                            </motion.button>
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.94 }}
                              disabled={isRotatingCode}
                              onClick={handleRotateSitterCode}
                              title="Get a new code and turn off the old one"
                              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium flex items-center justify-center cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </motion.button>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                          <div className="p-1.5 bg-white border border-slate-200 rounded-xl shrink-0">
                            <QRCodeSVG
                              value={`${window.location.origin}/?code=${generatedCode}`}
                              size={72}
                              level="M"
                            />
                          </div>
                          <div className="text-[11px] text-slate-600 leading-snug space-y-1">
                            <div className="font-semibold text-slate-800">
                              Scan to open right away
                            </div>
                            <div>
                              Sitters can point their camera here or enter{' '}
                              <span className="font-mono font-bold text-slate-900">
                                {generatedCode}
                              </span>
                              . Tap the refresh icon anytime to get a new code.
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={isGeneratingCode}
                      onClick={handleGenerateSitterCode}
                      className="w-full py-2.5 px-4 rounded-xl bg-accent-gradient hover:brightness-95 disabled:opacity-60 text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>
                        {isGeneratingCode
                          ? 'Generating Sitter Code...'
                          : generatedCode
                            ? 'Update Sitter Code'
                            : 'Generate Sitter Code'}
                      </span>
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() =>
                        exportCardAsImage(activeSharedPets, activeIncluded)
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-800 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-(--cs-accent)" />
                      Save Image
                    </motion.button>

                    {/* Plain-language phone backup & restore (zero technical jargon) */}
                    <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Switching phones?
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={handleSaveBackupToPhone}
                          className="py-2 px-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-(--cs-accent)" />
                          Save My Pets
                        </motion.button>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => backupFileInputRef.current?.click()}
                          className="py-2 px-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-(--cs-accent)" />
                          Bring Back Pets
                        </motion.button>
                      </div>
                      {backupStatusMessage && (
                        <p className="text-[11px] text-(--cs-accent) font-medium text-center">
                          {backupStatusMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}

            {/* ============================================================
                SCREEN 8: WHAT THE SITTER SEES (In-place editable + tap-to-call)
               ============================================================ */}
            {currentScreen === 'sitter-view' && (
              <div className="flex-1 flex flex-col justify-between p-6">
                <div className="space-y-4 overflow-y-auto pr-0.5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h1 className="text-base font-bold text-slate-900">
                        What the sitter sees
                      </h1>
                      <p className="text-[11px] text-slate-500">
                        {sharedSnapshot
                          ? 'Opened in browser · No app or login required'
                          : 'Tap any field to edit directly · No login required'}
                      </p>
                    </div>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => window.print()}
                      className="no-print p-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer"
                      title="Print or save as PDF"
                    >
                      <Download className="w-4 h-4" />
                    </motion.button>
                  </div>

                  <div className="space-y-3">
                    {activeSharedPets.map((pet, idx) => {
                      const isEditable = !sharedSnapshot;
                      const slotIdx = pet.slotIndex ?? activeIndex;
                      const petKey = `${slotIdx}-${idx}`;
                      const isExpanded = Boolean(expandedSitterPets[petKey]);
                      const toggleExpanded = () =>
                        setExpandedSitterPets((prev) => ({
                          ...prev,
                          [petKey]: !prev[petKey],
                        }));

                      const summaryText = [
                        pet.age,
                        pet.breed,
                        pet.sexStatus,
                        pet.weightLbs
                          ? formatWeightWithKg(
                              pet.weightLbs,
                              pet.weightUnit || 'lbs'
                            )
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <div
                          key={petKey}
                          className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
                        >
                          {/* Collapsed Pet Row Header with Arrow Toggle */}
                          <div className="w-full p-3.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {isEditable ? (
                                <motion.button
                                  type="button"
                                  whileTap={{ scale: 0.92 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const cId = circles[slotIdx]?.id;
                                    if (cId) setActiveCircleId(cId);
                                    openPhotoSourceMenu();
                                  }}
                                  className="w-11 h-11 rounded-full bg-(--cs-accent) text-(--cs-on-accent) flex items-center justify-center overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                                  title="Change photo"
                                >
                                  {pet.photoUrl ? (
                                    <img
                                      src={pet.photoUrl}
                                      alt={pet.name}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <Camera className="w-4 h-4" />
                                  )}
                                </motion.button>
                              ) : pet.photoUrl ? (
                                <img
                                  src={pet.photoUrl}
                                  alt={pet.name}
                                  referrerPolicy="no-referrer"
                                  className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-(--cs-accent) text-(--cs-on-accent) text-sm font-bold flex items-center justify-center shrink-0">
                                  {(pet.name || 'P').slice(0, 1).toUpperCase()}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={toggleExpanded}
                                className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
                              >
                                <div className="text-sm font-bold text-slate-900 truncate">
                                  {pet.name || `Pet ${idx + 1}`}
                                </div>
                                {summaryText && (
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {summaryText}
                                  </div>
                                )}
                              </button>
                            </div>

                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.9 }}
                              onClick={toggleExpanded}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Collapse ${pet.name || 'pet'} card`
                                  : `Expand ${pet.name || 'pet'} card`
                              }
                              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                            >
                              <motion.span
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 360,
                                  damping: 24,
                                }}
                                className="flex items-center justify-center"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </motion.span>
                            </motion.button>
                          </div>

                          {/* Expandable Full Pet Care Card */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                key="expanded-sitter-card"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 320,
                                  damping: 28,
                                }}
                                className="overflow-hidden"
                              >
                                <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3">
                                  {isEditable && (
                                    <div className="space-y-1.5 pb-2 border-b border-slate-100">
                                      <input
                                        type="text"
                                        value={pet.name}
                                        onChange={(e) =>
                                          updatePetBySlot(slotIdx, (p) => ({
                                            ...p,
                                            name: filterNameInput(e.target.value),
                                          }))
                                        }
                                        placeholder="Pet name"
                                        className="w-full px-2 py-1 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-(--cs-accent)"
                                      />
                                      <div className="grid grid-cols-3 gap-1">
                                        <input
                                          type="text"
                                          enterKeyHint="done"
                                          value={pet.age}
                                          onChange={(e) =>
                                            updatePetBySlot(slotIdx, (p) => ({
                                              ...p,
                                              age: filterAgeInput(e.target.value),
                                            }))
                                          }
                                          placeholder="Age"
                                          className="px-1.5 py-0.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-(--cs-accent)"
                                        />
                                        <input
                                          type="text"
                                          enterKeyHint="done"
                                          value={pet.breed}
                                          onChange={(e) =>
                                            updatePetBySlot(slotIdx, (p) => ({
                                              ...p,
                                              breed: filterNameInput(
                                                e.target.value
                                              ),
                                            }))
                                          }
                                          placeholder="Breed"
                                          className="px-1.5 py-0.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-(--cs-accent)"
                                        />
                                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded overflow-hidden focus-within:border-(--cs-accent)">
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            enterKeyHint="done"
                                            value={pet.weightLbs}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                weightLbs: filterWeightInput(
                                                  e.target.value
                                                ),
                                              }))
                                            }
                                            placeholder="Wt"
                                            className="w-full min-w-0 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 bg-transparent focus:outline-none"
                                          />
                                          <select
                                            value={pet.weightUnit || 'lbs'}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                weightUnit: e.target
                                                  .value as WeightUnit,
                                              }))
                                            }
                                            aria-label="Weight unit"
                                            className="pr-1 py-0.5 text-[10px] font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                                          >
                                            <option value="lbs">lbs</option>
                                            <option value="oz">oz</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between pt-0.5">
                                        <select
                                          value={pet.sexStatus}
                                          onChange={(e) =>
                                            updatePetBySlot(slotIdx, (p) => ({
                                              ...p,
                                              sexStatus: e.target
                                                .value as SexStatus,
                                            }))
                                          }
                                          aria-label="Sex and spay/neuter status"
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border cursor-pointer focus:outline-none focus:border-(--cs-accent) ${
                                            pet.sexStatus
                                              ? 'bg-(--cs-accent)/10 text-(--cs-accent) border-(--cs-accent)/30'
                                              : 'bg-slate-50 text-slate-500 border-slate-200'
                                          }`}
                                        >
                                          <option value="">Sex / Spay-Neuter</option>
                                          <option value="M-Neutered">M-Neutered</option>
                                          <option value="M-Intact">M-Intact</option>
                                          <option value="F-Spayed">F-Spayed</option>
                                          <option value="F-Intact">F-Intact</option>
                                        </select>
                                        {pet.weightLbs.trim() && (
                                          <span className="text-[10px] font-mono text-slate-500">
                                            {formatWeightWithKg(
                                              pet.weightLbs,
                                              pet.weightUnit || 'lbs'
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Care Sections — Editable in-place when owner is viewing */}
                                  <div className="space-y-2.5 text-xs leading-relaxed text-slate-800">
                                    {activeIncluded.feeding && (
                                      <div>
                                        <span className="font-bold text-slate-900 block mb-0.5">
                                          Feeding:
                                        </span>
                                        {isEditable ? (
                                          <textarea
                                            rows={2}
                                            value={pet.feeding}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                feeding: e.target.value,
                                              }))
                                            }
                                            placeholder="Add feeding instructions"
                                            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                          />
                                        ) : (
                                          <span>{pet.feeding}</span>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.meds && (
                                      <div>
                                        <span className="font-bold text-slate-900 block mb-0.5">
                                          Meds:
                                        </span>
                                        {isEditable ? (
                                          <textarea
                                            rows={2}
                                            value={pet.meds}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                meds: e.target.value,
                                              }))
                                            }
                                            placeholder="Add medication instructions"
                                            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                          />
                                        ) : (
                                          <span>{pet.meds}</span>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.walks && (
                                      <div>
                                        <span className="font-bold text-slate-900 block mb-0.5">
                                          Walks:
                                        </span>
                                        {isEditable ? (
                                          <textarea
                                            rows={2}
                                            value={pet.walks}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                walks: e.target.value,
                                              }))
                                            }
                                            placeholder="Add walk instructions"
                                            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                          />
                                        ) : (
                                          <span>{pet.walks}</span>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.quirks && (
                                      <div>
                                        <span className="font-bold text-slate-900 block mb-0.5">
                                          Quirks:
                                        </span>
                                        {isEditable ? (
                                          <textarea
                                            rows={2}
                                            value={pet.quirks}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                quirks: e.target.value,
                                              }))
                                            }
                                            placeholder="Add quirks & comfort notes"
                                            className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                          />
                                        ) : (
                                          <span>{pet.quirks}</span>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.vet && (
                                      <div className="space-y-1">
                                        <span className="font-bold text-slate-900 block">
                                          Vet &amp; Emergency:
                                        </span>
                                        {isEditable ? (
                                          <div className="space-y-1.5">
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <input
                                                type="text"
                                                value={pet.vetName}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      vetName: e.target.value,
                                                    })
                                                  )
                                                }
                                                placeholder="Vet name"
                                                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                              <input
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength={14}
                                                value={pet.vetPhone}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      vetPhone:
                                                        formatPhone10Digits(
                                                          e.target.value
                                                        ),
                                                    })
                                                  )
                                                }
                                                placeholder="(555) 123-4567"
                                                className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <input
                                                type="text"
                                                value={pet.erHospital}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      erHospital:
                                                        e.target.value,
                                                    })
                                                  )
                                                }
                                                placeholder="After-hours ER"
                                                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                              <input
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength={14}
                                                value={pet.ownerPhone}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      ownerPhone:
                                                        formatPhone10Digits(
                                                          e.target.value
                                                        ),
                                                    })
                                                  )
                                                }
                                                placeholder="(555) 123-4567"
                                                className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                              <input
                                                type="text"
                                                value={pet.backupContactName}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      backupContactName:
                                                        filterNameInput(
                                                          e.target.value
                                                        ),
                                                    })
                                                  )
                                                }
                                                placeholder="Backup contact"
                                                className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                              <input
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength={14}
                                                value={pet.backupContactPhone}
                                                onChange={(e) =>
                                                  updatePetBySlot(
                                                    slotIdx,
                                                    (p) => ({
                                                      ...p,
                                                      backupContactPhone:
                                                        formatPhone10Digits(
                                                          e.target.value
                                                        ),
                                                    })
                                                  )
                                                }
                                                placeholder="(555) 123-4567"
                                                className="px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-1">
                                            <div>
                                              {pet.vetName ? (
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                                    pet.vetName
                                                  )}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="underline text-(--cs-accent) font-semibold inline-flex items-center gap-0.5"
                                                >
                                                  <MapPin className="w-3 h-3 shrink-0" />
                                                  {pet.vetName}
                                                </a>
                                              ) : null}
                                              {pet.vetPhone
                                                ? `${pet.vetName ? ', ' : ''}${pet.vetPhone}`
                                                : ''}
                                            </div>
                                            {pet.erHospital && (
                                              <div>
                                                After-hours ER:{' '}
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                                    pet.erHospital
                                                  )}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="underline text-(--cs-accent) font-semibold inline-flex items-center gap-0.5"
                                                >
                                                  <MapPin className="w-3 h-3 shrink-0" />
                                                  {pet.erHospital}
                                                </a>
                                              </div>
                                            )}
                                            {(pet.backupContactName ||
                                              pet.backupContactPhone) && (
                                              <div>
                                                Backup contact:{' '}
                                                {[
                                                  pet.backupContactName,
                                                  pet.backupContactPhone,
                                                ]
                                                  .filter(Boolean)
                                                  .join(' · ')}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.emergencyAuth && (
                                      <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-slate-900 space-y-1">
                                        <span className="font-bold block">
                                          If something&apos;s wrong:
                                        </span>
                                        {isEditable ? (
                                          <textarea
                                            rows={2}
                                            value={pet.emergencyAuth}
                                            onChange={(e) =>
                                              updatePetBySlot(slotIdx, (p) => ({
                                                ...p,
                                                emergencyAuth: e.target.value,
                                              }))
                                            }
                                            placeholder="Add emergency authorization note"
                                            className="w-full p-2 text-xs bg-white/90 border border-amber-300 rounded-lg focus:outline-none focus:border-(--cs-accent)"
                                          />
                                        ) : (
                                          <span>{pet.emergencyAuth}</span>
                                        )}
                                      </div>
                                    )}

                                    {activeIncluded.vaccines && (
                                      <div className="pt-1 border-t border-slate-100 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-slate-900">
                                            Vaccines:
                                          </span>
                                          {isEditable && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updatePetBySlot(
                                                  slotIdx,
                                                  (p) => ({
                                                    ...p,
                                                    vaccines: [
                                                      ...p.vaccines,
                                                      {
                                                        id: `v-${Date.now()}`,
                                                        name: '',
                                                        dateGiven: '',
                                                        expiresAt: '',
                                                      },
                                                    ],
                                                  })
                                                )
                                              }
                                              className="text-[11px] font-semibold text-(--cs-accent) hover:underline cursor-pointer"
                                            >
                                              + Add
                                            </button>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          {pet.vaccines.map((v, vIdx) =>
                                            isEditable ? (
                                              <div
                                                key={v.id}
                                                className="flex items-center gap-1"
                                              >
                                                <input
                                                  type="text"
                                                  value={v.name}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    updatePetBySlot(
                                                      slotIdx,
                                                      (p) => {
                                                        const next = [
                                                          ...p.vaccines,
                                                        ];
                                                        next[vIdx] = {
                                                          ...next[vIdx],
                                                          name: val,
                                                        };
                                                        return {
                                                          ...p,
                                                          vaccines: next,
                                                        };
                                                      }
                                                    );
                                                  }}
                                                  placeholder="Vaccine"
                                                  className="flex-1 px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded"
                                                />
                                                <input
                                                  type="date"
                                                  value={v.expiresAt}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    updatePetBySlot(
                                                      slotIdx,
                                                      (p) => {
                                                        const next = [
                                                          ...p.vaccines,
                                                        ];
                                                        next[vIdx] = {
                                                          ...next[vIdx],
                                                          expiresAt: val,
                                                        };
                                                        return {
                                                          ...p,
                                                          vaccines: next,
                                                        };
                                                      }
                                                    );
                                                  }}
                                                  className="px-1.5 py-1 text-[11px] font-mono bg-slate-50 border border-slate-200 rounded"
                                                />
                                              </div>
                                            ) : (
                                              <div
                                                key={v.id}
                                                className="flex items-center justify-between text-[11px] font-mono text-slate-600"
                                              >
                                                <span>{v.name}</span>
                                                <span>
                                                  Exp: {v.expiresAt || '—'}
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Tap-to-call buttons for Vet, Owner, and Backup Contact */}
                                  <div
                                    className={`pt-2 grid gap-2 ${
                                      pet.backupContactPhone
                                        ? 'grid-cols-3'
                                        : 'grid-cols-2'
                                    }`}
                                  >
                                    <motion.a
                                      whileTap={{ scale: 0.96 }}
                                      href={
                                        pet.vetPhone
                                          ? `tel:${pet.vetPhone.replace(
                                              /[^0-9+]/g,
                                              ''
                                            )}`
                                          : undefined
                                      }
                                      className={`py-2.5 px-2.5 rounded-xl text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                                        pet.vetPhone
                                          ? 'bg-(--cs-accent) hover:bg-(--cs-accent-hover) cursor-pointer'
                                          : 'bg-(--cs-accent)/50 cursor-default'
                                      }`}
                                    >
                                      <Phone className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">Call Vet</span>
                                    </motion.a>
                                    <motion.a
                                      whileTap={{ scale: 0.96 }}
                                      href={
                                        pet.ownerPhone
                                          ? `tel:${pet.ownerPhone.replace(
                                              /[^0-9+]/g,
                                              ''
                                            )}`
                                          : undefined
                                      }
                                      className={`py-2.5 px-2.5 rounded-xl text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                                        pet.ownerPhone
                                          ? 'bg-slate-900 hover:bg-slate-800 cursor-pointer'
                                          : 'bg-slate-900/50 cursor-default'
                                      }`}
                                    >
                                      <Phone className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">
                                        Call Owner
                                      </span>
                                    </motion.a>
                                    {pet.backupContactPhone && (
                                      <motion.a
                                        whileTap={{ scale: 0.96 }}
                                        href={`tel:${pet.backupContactPhone.replace(
                                          /[^0-9+]/g,
                                          ''
                                        )}`}
                                        className="py-2.5 px-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                      >
                                        <Phone className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">
                                          Call Backup
                                        </span>
                                      </motion.a>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {renderBottomNavArrows()}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Spring-animated Photo Source Action Sheet ("Take a photo now" vs. "Choose from gallery") */}
        <AnimatePresence>
          {showPhotoMenu && (
            <motion.div
              key="photo-source-backdrop"
              data-no-swipe="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPhotoMenu(false)}
              className="no-print absolute inset-0 bg-black/45 z-30 flex items-end justify-center p-4"
            >
              <motion.div
                initial={{ y: 120, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 120, opacity: 0, scale: 0.96 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 28,
                  mass: 0.8,
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-white rounded-3xl p-4 shadow-xl space-y-2.5 border border-slate-200"
              >
                <div className="flex items-center justify-between px-1 pb-1">
                  <span className="text-xs font-bold text-slate-900">
                    Add pet photo
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowPhotoMenu(false)}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Close photo menu"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  onClick={() => startLiveCamera('environment')}
                  className="w-full py-3 px-4 rounded-2xl bg-accent-gradient hover:brightness-95 text-(--cs-on-accent) text-xs font-semibold flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  Take a photo now
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  onClick={() => {
                    setShowPhotoMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-(--cs-accent)" />
                  Choose from gallery
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Spring-animated Live Camera Viewfinder Overlay */}
        <AnimatePresence>
          {isCameraOpen && (
            <motion.div
              key="live-camera-modal"
              data-no-swipe="true"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{
                type: 'spring',
                stiffness: 360,
                damping: 28,
              }}
              className="no-print absolute inset-0 bg-neutral-950 z-40 flex flex-col justify-between p-5 text-(--cs-on-accent)"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-tight text-neutral-200">
                  Take pet photo
                </span>
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={handleFlipCamera}
                    className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-(--cs-on-accent) cursor-pointer"
                    title="Flip camera"
                    aria-label="Flip camera"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={stopLiveCamera}
                    className="p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-(--cs-on-accent) cursor-pointer"
                    title="Cancel"
                    aria-label="Close camera"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center my-4">
                <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-white shadow-2xl bg-neutral-900 flex items-center justify-center relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${
                      cameraFacingMode === 'user' ? 'scale-x-[-1]' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center pb-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                  onClick={handleSnapPhoto}
                  aria-label="Capture photo"
                  className="w-16 h-16 rounded-full bg-white p-1.5 shadow-lg flex items-center justify-center cursor-pointer"
                >
                  <span className="w-full h-full rounded-full bg-(--cs-accent) flex items-center justify-center">
                    <Camera className="w-6 h-6 text-(--cs-on-accent)" />
                  </span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
