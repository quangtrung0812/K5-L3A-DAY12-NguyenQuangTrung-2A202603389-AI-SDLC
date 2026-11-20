import './style.css';
import {
  addLeaderboardEntry,
  createBenchSim,
  createDefaultInput,
  distXZ,
  formatIsoWithTimezone,
  LanternIslandSim,
  sortAndTrimLeaderboard,
  validateLeaderboardName,
  type LeaderboardEntry,
} from '../sim/index.js';
import {
  DASH_COOLDOWN_TICKS,
  DT,
  FUEL_MAX_UNITS,
  INTERACT_HEIGHT_TOLERANCE,
  LOW_FUEL_UNITS,
  PULSE_COOLDOWN_TICKS,
  TICK_RATE,
  TUNING,
} from '../sim/tuning.js';
import type { InputState, NightNumber, Vec3 } from '../sim/types.js';
import { SoundEngine } from './audio.js';
import { LanternIslandRenderer } from './scene.js';

// ── PHASE 4 BENCHMARK MODE (?bench=1&seed=42&duration=30) ──
const urlParams = new URLSearchParams(window.location.search);
const isBenchMode = urlParams.get('bench') === '1';

if (isBenchMode) {
  const parsedSeed = Number.parseInt(urlParams.get('seed') ?? '42', 10);
  const parsedDuration = Number.parseFloat(urlParams.get('duration') ?? '30');
  runBenchmarkMode(
    Number.isInteger(parsedSeed) ? parsedSeed : 42,
    Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : 30,
    urlParams.get('screenshot') === '1',
  );
} else {
  runInteractiveGame();
}

function runBenchmarkMode(seed: number, durationS: number, captureShot: boolean): void {
  const benchInitMs = performance.now();
  const canvasRoot = document.getElementById('canvas-root')!;
  for (const id of ['hud-top', 'hud-bottom', 'hud-prompt', 'hud-live', 'hud-subtitle', 'offscreen-arrow', 'shade-spawn-arrow']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  const benchSim = createBenchSim(seed);
  const benchRenderer = new LanternIslandRenderer(canvasRoot, {
    benchMode: true,
    preserveDrawingBuffer: false,
  });
  benchRenderer.resetForNight(1);

  window.addEventListener('resize', () => {
    benchRenderer.resize(canvasRoot.clientWidth, canvasRoot.clientHeight);
  });

  // Render first frame immediately and report load_ms
  benchRenderer.syncBench(benchSim, 0, DT);
  const firstFrameLoadMs = Math.round(performance.now() - benchInitMs);
  fetch('/__bench_first_frame', { method: 'POST' }).catch(() => {});

  const warmupS = 3.0;
  const startMs = performance.now();
  let lastMs = startMs;
  let simAcc = 0;
  let benchElapsedS = 0;
  let shotCaptured = false;
  const frameDtsMs: number[] = [];
  const defaultInput = createDefaultInput();

  function benchLoop(nowMs: number): void {
    const rawDtMs = Math.max(0.01, nowMs - lastMs);
    lastMs = nowMs;
    const dtSec = Math.min(0.1, rawDtMs / 1000);
    benchElapsedS += dtSec;

    simAcc += dtSec;
    while (simAcc >= DT) {
      benchSim.step(defaultInput);
      simAcc -= DT;
    }

    benchRenderer.syncBench(benchSim, benchElapsedS, dtSec);

    const wallElapsedS = (nowMs - startMs) / 1000;
    if (captureShot && !shotCaptured && wallElapsedS >= 2.0) {
      shotCaptured = true;
      const dataUrl = benchRenderer.captureScreenshotDataUrl();
      fetch('/__bench_screenshot', { method: 'POST', body: dataUrl }).catch(() => {});
    }

    if (wallElapsedS >= warmupS) {
      frameDtsMs.push(rawDtMs);
    }

    if (wallElapsedS >= warmupS + durationS && frameDtsMs.length > 0) {
      const n = frameDtsMs.length;
      let sumDt = 0;
      for (const dt of frameDtsMs) sumDt += dt;
      const avgFps = Math.round(((1000 * n) / sumDt) * 10) / 10;

      const sortedDesc = [...frameDtsMs].sort((a, b) => b - a);
      const k = Math.max(1, Math.ceil(0.01 * n));
      let worstSum = 0;
      for (let i = 0; i < k; i++) worstSum += sortedDesc[i];
      const p1LowFps = Math.round((1000 / (worstSum / k)) * 10) / 10;

      const sortedAsc = [...frameDtsMs].sort((a, b) => a - b);
      const p95Idx = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
      const frameMsP95 = Math.round(sortedAsc[p95Idx] * 10) / 10;

      const payload = {
        avg_fps: avgFps,
        p1_low_fps: p1LowFps,
        frame_ms_p95: frameMsP95,
        frames: n,
        load_ms: firstFrameLoadMs,
        renderer: benchRenderer.getRendererDescription(),
      };
      fetch('/__bench_result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      return;
    }

    requestAnimationFrame(benchLoop);
  }

  requestAnimationFrame(benchLoop);
}

// ── INTERACTIVE GAME MODE ──
type KeyAction =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

type KeyBindings = Record<KeyAction, string>;

const DEFAULT_KEYBINDS: KeyBindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'KeyP',
};

const ACTION_LABELS: Record<KeyAction, string> = {
  forward: 'Đi tiến',
  back: 'Đi lùi',
  left: 'Sang trái',
  right: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt (Dash)',
  interact: 'Tương tác / Châm dầu',
  pulse: 'Tỏa Sáng (Pulse)',
  pause: 'Tạm dừng',
};

const ALL_ACTIONS: KeyAction[] = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'dash',
  'interact',
  'pulse',
  'pause',
];

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code;
}

interface UserSettings {
  volume: number; // 0..100
  sensitivity: number; // 0.15..1.0
  colorblind: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  keybinds: KeyBindings;
}

const SETTINGS_KEY = 'dao_den_long_settings_v2';
const LB_LOCAL_KEY = 'dao_den_long_leaderboard_v1';

function loadSettings(): UserSettings {
  const prefersReduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem('dao_den_long_settings_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const kb: KeyBindings = { ...DEFAULT_KEYBINDS };
      if (parsed.keybinds && typeof parsed.keybinds === 'object') {
        for (const act of ALL_ACTIONS) {
          if (typeof parsed.keybinds[act] === 'string' && parsed.keybinds[act].length > 0) {
            kb[act] = parsed.keybinds[act];
          }
        }
      }
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : 70,
        sensitivity:
          typeof parsed.sensitivity === 'number'
            ? Math.max(0.15, Math.min(1.0, parsed.sensitivity))
            : 0.4,
        colorblind: typeof parsed.colorblind === 'boolean' ? parsed.colorblind : false,
        reducedMotion:
          typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : prefersReduced,
        largeText: typeof parsed.largeText === 'boolean' ? parsed.largeText : false,
        keybinds: kb,
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    volume: 70,
    sensitivity: 0.4,
    colorblind: false,
    reducedMotion: prefersReduced,
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS },
  };
}

function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.entries)) {
        const sorted = sortAndTrimLeaderboard(data.entries);
        try {
          localStorage.setItem(LB_LOCAL_KEY, JSON.stringify({ entries: sorted }));
        } catch {
          // ignore
        }
        return sorted;
      }
    }
  } catch {
    // fallback to localStorage when running via static hosting
  }
  try {
    const raw = localStorage.getItem(LB_LOCAL_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.entries)) return sortAndTrimLeaderboard(data.entries);
    }
  } catch {
    // ignore
  }
  return [];
}

async function persistLeaderboardEntry(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.entries)) {
        const sorted = sortAndTrimLeaderboard(data.entries);
        try {
          localStorage.setItem(LB_LOCAL_KEY, JSON.stringify({ entries: sorted }));
        } catch {
          // ignore
        }
        return sorted;
      }
    }
  } catch {
    // fallback to localStorage
  }
  const existing = await fetchLeaderboard();
  const updated = addLeaderboardEntry(existing, entry);
  try {
    localStorage.setItem(LB_LOCAL_KEY, JSON.stringify({ entries: updated }));
  } catch {
    // ignore
  }
  return updated;
}

function runInteractiveGame(): void {
  const canvasRoot = document.getElementById('canvas-root')!;
  const screenFlash = document.getElementById('screen-flash')!;
  const hudNightName = document.getElementById('hud-night-name')!;
  const hudFlames = document.getElementById('hud-flames')!;
  const hudCharmBadge = document.getElementById('hud-charm-badge')!;
  const hudCharmTime = document.getElementById('hud-charm-time')!;
  const hudWindBadge = document.getElementById('hud-wind-badge')!;
  const hudLowFuelBadge = document.getElementById('hud-lowfuel-badge')!;
  const hudClockBox = document.getElementById('hud-clock-box')!;
  const hudClockWarn = document.getElementById('hud-clock-warn')!;
  const hudTime = document.getElementById('hud-time')!;
  const hudLanterns = document.getElementById('hud-lanterns')!;
  const hudScore = document.getElementById('hud-score')!;
  const hudSubtitle = document.getElementById('hud-subtitle')!;
  const hudPrompt = document.getElementById('hud-prompt')!;
  const hudLive = document.getElementById('hud-live')!;
  const hudCarriedText = document.getElementById('hud-carried-text')!;
  const moteSlotsRoot = document.getElementById('mote-slots')!;
  const dashBar = document.getElementById('dash-bar')!;
  const hudDashText = document.getElementById('hud-dash-text')!;
  const skillDashCard = document.getElementById('skill-dash')!;
  const pulseBar = document.getElementById('pulse-bar')!;
  const hudPulseText = document.getElementById('hud-pulse-text')!;
  const skillPulseCard = document.getElementById('skill-pulse')!;
  const hudFps = document.getElementById('hud-fps')!;

  const offscreenArrow = document.getElementById('offscreen-arrow')!;
  const offscreenArrowHead = offscreenArrow.querySelector('.arrow-head') as HTMLElement;
  const offscreenArrowLabel = document.getElementById('offscreen-arrow-label')!;

  const shadeSpawnArrow = document.getElementById('shade-spawn-arrow')!;
  const shadeSpawnArrowHead = shadeSpawnArrow.querySelector('.arrow-head') as HTMLElement;
  const shadeSpawnArrowLabel = document.getElementById('shade-spawn-arrow-label')!;

  const lblKeyPause = document.getElementById('lbl-key-pause')!;
  const kbdMove = document.getElementById('kbd-move')!;
  const kbdJump = document.getElementById('kbd-jump')!;
  const kbdDash = document.getElementById('kbd-dash')!;
  const kbdInteract = document.getElementById('kbd-interact')!;
  const kbdPulse = document.getElementById('kbd-pulse')!;
  const kbdSkillDash = document.getElementById('kbd-skill-dash')!;
  const kbdSkillPulse = document.getElementById('kbd-skill-pulse')!;

  const btnPauseHud = document.getElementById('btn-pause-hud') as HTMLButtonElement;
  const menuDialog = document.getElementById('menu-dialog') as HTMLDialogElement;
  const btnStartCampaign = document.getElementById('btn-start-campaign') as HTMLButtonElement;
  const btnOpenLeaderboard = document.getElementById('btn-open-leaderboard') as HTMLButtonElement;
  const btnOpenSettingsMenu = document.getElementById('btn-open-settings-menu') as HTMLButtonElement;

  const introDialog = document.getElementById('intro-dialog') as HTMLDialogElement;
  const introEyebrow = document.getElementById('intro-eyebrow')!;
  const introTitle = document.getElementById('intro-title')!;
  const introQuote = document.getElementById('intro-quote')!;
  const introTips = document.getElementById('intro-tips')!;

  const pauseDialog = document.getElementById('pause-dialog') as HTMLDialogElement;
  const btnResume = document.getElementById('btn-resume') as HTMLButtonElement;
  const btnRestartNight = document.getElementById('btn-restart-night') as HTMLButtonElement;
  const btnOpenSettingsPause = document.getElementById('btn-open-settings-pause') as HTMLButtonElement;
  const btnBackMenu = document.getElementById('btn-back-menu') as HTMLButtonElement;

  const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement;
  const volumeSlider = document.getElementById('setting-volume') as HTMLInputElement;
  const volumeVal = document.getElementById('volume-val')!;
  const sensSlider = document.getElementById('setting-sens') as HTMLInputElement;
  const sensVal = document.getElementById('sens-val')!;
  const colorblindCheckbox = document.getElementById('setting-colorblind') as HTMLInputElement;
  const reducedMotionCheckbox = document.getElementById('setting-reduced-motion') as HTMLInputElement;
  const largeTextCheckbox = document.getElementById('setting-large-text') as HTMLInputElement;
  const btnResetKeybinds = document.getElementById('btn-reset-keybinds') as HTMLButtonElement;
  const keybindStatus = document.getElementById('keybind-status')!;
  const keybindsGrid = document.getElementById('keybinds-grid')!;

  const leaderboardDialog = document.getElementById('leaderboard-dialog') as HTMLDialogElement;
  const lbTbody = document.getElementById('lb-tbody')!;

  const resultDialog = document.getElementById('result-dialog') as HTMLDialogElement;
  const resultEyebrow = document.getElementById('result-eyebrow')!;
  const resultTitle = document.getElementById('result-dialog-title')!;
  const resultSummary = document.getElementById('result-summary')!;
  const resLanterns = document.getElementById('res-lanterns')!;
  const resFlames = document.getElementById('res-flames')!;
  const resScore = document.getElementById('res-score')!;
  const resTotalScore = document.getElementById('res-total-score')!;
  const lbSubmitBox = document.getElementById('lb-submit-box')!;
  const lbNameInput = document.getElementById('lb-name-input') as HTMLInputElement;
  const btnLbSave = document.getElementById('btn-lb-save') as HTMLButtonElement;
  const lbSubmitMsg = document.getElementById('lb-submit-msg')!;
  const btnResultMenu = document.getElementById('btn-result-menu') as HTMLButtonElement;
  const btnResultPrimary = document.getElementById('btn-result-primary') as HTMLButtonElement;

  // Dynamic mote slot bar (10..20 slots)
  const moteSlotEls: HTMLDivElement[] = [];
  let renderedCapacity = 0;

  function ensureMoteSlots(cap: number): void {
    if (renderedCapacity === cap) return;
    renderedCapacity = cap;
    moteSlotsRoot.style.setProperty('--cap', String(cap));
    while (moteSlotEls.length < cap) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      moteSlotsRoot.appendChild(slot);
      moteSlotEls.push(slot);
    }
    for (let i = 0; i < moteSlotEls.length; i++) {
      moteSlotEls[i].hidden = i >= cap;
    }
  }
  ensureMoteSlots(TUNING.carry_capacity);

  const settings = loadSettings();
  const sound = new SoundEngine();
  const renderer = new LanternIslandRenderer(canvasRoot);

  function applyAccessibilitySettings(): void {
    sound.setVolume(settings.volume / 100);
    volumeSlider.value = String(settings.volume);
    volumeVal.textContent = `${settings.volume}%`;
    sensSlider.value = String(Math.round(settings.sensitivity * 100));
    sensVal.textContent = settings.sensitivity.toFixed(2);
    colorblindCheckbox.checked = settings.colorblind;
    reducedMotionCheckbox.checked = settings.reducedMotion;
    largeTextCheckbox.checked = settings.largeText;

    document.body.classList.toggle('colorblind', settings.colorblind);
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    document.documentElement.classList.toggle('large-text', settings.largeText);
    renderer.setColorblind(settings.colorblind);
    renderer.setReducedMotion(settings.reducedMotion);
    updateKeybindLabels();
  }

  function updateKeybindLabels(): void {
    const kb = settings.keybinds;
    kbdMove.textContent = `${formatKeyCode(kb.forward)}${formatKeyCode(kb.left)}${formatKeyCode(kb.back)}${formatKeyCode(kb.right)}`;
    kbdJump.textContent = formatKeyCode(kb.jump);
    kbdDash.textContent = formatKeyCode(kb.dash);
    kbdInteract.textContent = formatKeyCode(kb.interact);
    kbdPulse.textContent = formatKeyCode(kb.pulse);
    kbdSkillDash.textContent = formatKeyCode(kb.dash);
    kbdSkillPulse.textContent = formatKeyCode(kb.pulse);
    lblKeyPause.textContent = formatKeyCode(kb.pause);
  }

  let listeningAction: KeyAction | null = null;
  const keybindButtons = new Map<KeyAction, HTMLButtonElement>();

  function renderKeybindsEditor(): void {
    keybindsGrid.innerHTML = '';
    keybindButtons.clear();
    for (const act of ALL_ACTIONS) {
      const row = document.createElement('div');
      row.className = 'keybind-item';
      const label = document.createElement('span');
      label.textContent = ACTION_LABELS[act];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keybind-btn';
      btn.textContent =
        listeningAction === act ? 'Nhấn phím...' : formatKeyCode(settings.keybinds[act]);
      if (listeningAction === act) btn.classList.add('listening');
      btn.addEventListener('click', () => {
        listeningAction = listeningAction === act ? null : act;
        keybindStatus.hidden = true;
        renderKeybindsEditor();
      });
      row.append(label, btn);
      keybindsGrid.appendChild(row);
      keybindButtons.set(act, btn);
    }
  }

  applyAccessibilitySettings();
  renderKeybindsEditor();

  let currentNight: NightNumber = 1;
  let runSeedCounter = 1;
  let campaignSeed = 202611;
  let campaignTotalScore = 0;
  let campaignNightsWon = 0;
  let sim = new LanternIslandSim({ seed: campaignSeed, night: 1 });
  renderer.resetForNight(1);

  let camYawDeg = 0;
  let camPitchDeg = 32;
  let camDist = 15.5;
  let targetCamDist = 15.5;
  let uiState: 'menu' | 'intro' | 'playing' | 'paused' | 'result' = 'menu';
  let settingsReturnTo: 'menu' | 'paused' = 'menu';
  let resultShown = false;
  let lbSavedThisResult = false;
  let toastTimer: number | null = null;
  let flashTimer: number | null = null;
  let lastCountdownSec = -1;
  let windWarningSounded = false;

  // Shade-spawn visual accessibility indicator (arrow + subtitle for 3.5s)
  let recentShadeSpawn: { id: string; pos: Vec3; expiresAtMs: number } | null = null;

  const pressedKeys = new Set<string>();
  let queuedJump = false;
  let queuedInteract = false;
  let queuedPulse = false;
  let queuedDash = false;
  let queuedPauseToggle = false;

  let lastPointerX: number | null = null;
  let lastPointerY: number | null = null;

  function triggerScreenFlash(kind: 'hit' | 'pulse'): void {
    if (settings.reducedMotion) return;
    screenFlash.classList.remove('hit', 'pulse');
    void screenFlash.offsetWidth;
    screenFlash.classList.add(kind);
    if (flashTimer !== null) window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      screenFlash.classList.remove('hit', 'pulse');
    }, 220);
  }

  function releasePointerLock(): void {
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
  }

  function tryRequestPointerLock(): void {
    if (document.pointerLockElement !== canvasRoot && typeof canvasRoot.requestPointerLock === 'function') {
      try {
        const res = canvasRoot.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch {
        // ignore if user gesture not available
      }
    }
  }

  function showToast(message: string): void {
    hudLive.textContent = message;
    hudLive.classList.add('visible');
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      hudLive.classList.remove('visible');
    }, 2400);
  }

  function formatTime(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function closeAllDialogs(): void {
    listeningAction = null;
    for (const d of [menuDialog, introDialog, pauseDialog, settingsDialog, leaderboardDialog, resultDialog]) {
      if (d.open) d.close();
    }
  }

  function openMainMenu(): void {
    releasePointerLock();
    closeAllDialogs();
    uiState = 'menu';
    pressedKeys.clear();
    lastPointerX = null;
    lastPointerY = null;
    menuDialog.showModal();
  }

  async function openLeaderboardDialog(): Promise<void> {
    const entries = await fetchLeaderboard();
    lbTbody.innerHTML = '';
    if (entries.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'Chưa có thành tích nào được lưu. Hãy hoàn thành hoặc thử sức một Đêm để ghi tên!';
      tr.appendChild(td);
      lbTbody.appendChild(tr);
    } else {
      entries.forEach((e, idx) => {
        const tr = document.createElement('tr');
        const cells = [
          String(idx + 1),
          e.name,
          String(e.score),
          `${e.nights_won} / 3`,
          e.achieved_at.replace('T', ' ').slice(0, 19),
        ];
        for (const text of cells) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        lbTbody.appendChild(tr);
      });
    }
    if (menuDialog.open) menuDialog.close();
    leaderboardDialog.showModal();
  }

  function startNight(night: NightNumber, resetCampaign: boolean): void {
    releasePointerLock();
    if (resetCampaign) {
      campaignTotalScore = 0;
      campaignNightsWon = 0;
      runSeedCounter += 1;
      campaignSeed = 202600 + night * 100 + runSeedCounter;
    }
    currentNight = night;
    const nightSeed = campaignSeed + (night - 1);
    sim = new LanternIslandSim({ seed: nightSeed, night });
    renderer.resetForNight(night);
    camYawDeg = 0;
    camPitchDeg = 32;
    camDist = 15.5;
    targetCamDist = 15.5;
    resultShown = false;
    lbSavedThisResult = false;
    lastCountdownSec = -1;
    windWarningSounded = false;
    recentShadeSpawn = null;
    queuedJump = false;
    queuedInteract = false;
    queuedPulse = false;
    queuedDash = false;
    queuedPauseToggle = false;
    lastPointerX = null;
    lastPointerY = null;
    accumulator = 0;
    lastFrameMs = performance.now();

    closeAllDialogs();
    uiState = 'intro';
    introEyebrow.textContent = `Đêm ${night} / 3`;
    introTitle.textContent = sim.map.name;
    introQuote.textContent = sim.map.introQuote;

    const tipsByNight: Record<NightNumber, string[]> = {
      1: [
        'Đèn sáng hao 1 dầu/giây — hãy châm dầu (+10 dầu/đom đóm) và giữ ít nhất 3/5 đèn sáng tới bình minh (4 phút)!',
        'Đèn dưới 30 dầu mất vùng an toàn 6m và bị Bóng Mực hút 5 dầu/giây; Tỏa Sáng trúng con đang hút nhận +15 điểm!',
        'Mỗi lần thắp đèn tăng sức chứa thêm +2 (tối đa 20); đèn đã từng sáng chỉ tốn 5 đom đóm để thắp lại!',
      ],
      2: [
        'Giữ tối thiểu 4/6 Đèn Lồng sáng tới bình minh (4 phút 30 giây) trên hai hòn đảo nối bằng cầu tre và 2 bục gió.',
        'Nhặt Bùa Gió đỏ viền vàng trên cầu tre để tăng tốc 7.2 m/s và Lướt không hồi chiêu trong 10 giây.',
        'Gió Lạc bay nhanh và cướp đom đóm khi bạn mang ≥ 5 đốm — dùng Tỏa Sáng để bắt nó nhả lại!',
      ],
      3: [
        'Giữ tối thiểu 5/7 Đèn Lồng sáng tới bình minh (5 phút) trên Đảo Chuông 3 tầng — leo 2 con dốc và dùng bục nhảy.',
        'Mỗi 30 giây có một cơn gió mạnh đẩy 2 m/s trong 5 giây (báo trước 2 giây bằng phụ đề, lá vàng bay & âm thanh).',
        'Bóng Mực Đêm 3 nhanh hơn (4.5 m/s) và sẽ lao tới hút dầu đèn dưới 30 — hãy tuần tra châm dầu đều đặn!',
      ],
    };

    introTips.innerHTML = '';
    for (const tip of tipsByNight[night]) {
      const li = document.createElement('li');
      li.textContent = tip;
      introTips.appendChild(li);
    }
    introDialog.showModal();
  }

  function togglePauseUi(): void {
    if (uiState === 'playing') {
      releasePointerLock();
      if (sim.state === 'playing') {
        const pauseIn = createDefaultInput();
        pauseIn.cam_yaw_deg = camYawDeg;
        pauseIn.pause = true;
        sim.step(pauseIn);
        const releaseIn = createDefaultInput();
        releaseIn.cam_yaw_deg = camYawDeg;
        sim.step(releaseIn);
      }
      uiState = 'paused';
      pressedKeys.clear();
      queuedJump = false;
      queuedInteract = false;
      queuedPulse = false;
      queuedDash = false;
      queuedPauseToggle = false;
      lastPointerX = null;
      lastPointerY = null;
      if (!pauseDialog.open) pauseDialog.showModal();
    } else if (uiState === 'paused') {
      if (pauseDialog.open) pauseDialog.close();
      if (sim.state === 'paused') {
        const releaseIn = createDefaultInput();
        releaseIn.cam_yaw_deg = camYawDeg;
        sim.step(releaseIn);
        const resumeIn = createDefaultInput();
        resumeIn.cam_yaw_deg = camYawDeg;
        resumeIn.pause = true;
        sim.step(resumeIn);
      }
      queuedPauseToggle = false;
      accumulator = 0;
      lastFrameMs = performance.now();
      lastPointerX = null;
      lastPointerY = null;
      uiState = 'playing';
      tryRequestPointerLock();
    }
  }

  function showResultDialog(): void {
    releasePointerLock();
    resultShown = true;
    lbSavedThisResult = false;
    uiState = 'result';
    pressedKeys.clear();
    lastPointerX = null;
    lastPointerY = null;

    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const won = sim.state === 'won';
    if (won) {
      campaignTotalScore += sim.score;
      campaignNightsWon = Math.min(3, campaignNightsWon + 1);
      sound.playWin();
    } else {
      sound.playLose();
    }

    if (won && currentNight === 3) {
      resultEyebrow.textContent = 'Bình Minh Đã Lên! (dawn_survived)';
      resultTitle.textContent = 'Chúc mừng giữ sáng Ba Hòn Đảo!';
      resultSummary.textContent =
        'Mây đã giữ vững ánh đèn trên Đảo Bến, Đảo Cau và Đảo Chuông cho tới bình minh. Sương đen tan biến hoàn toàn!';
      btnResultPrimary.textContent = 'Chơi lại từ Đêm 1';
    } else if (won) {
      resultEyebrow.textContent = `Vượt qua Đêm ${currentNight} · Bình minh`;
      resultTitle.textContent = `${sim.map.name} đã trụ vững tới bình minh!`;
      resultSummary.textContent = `Giữ được ${litCount}/${sim.lanterns.length} đèn sáng (ngưỡng ${sim.getWinLitThreshold()}). Sẵn sàng cho hòn đảo tiếp theo!`;
      btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1}`;
    } else {
      resultEyebrow.textContent = `Thất bại · Đêm ${currentNight}`;
      resultTitle.textContent =
        sim.gameOverReason === 'dawn' ? 'Không đủ đèn sáng lúc bình minh...' : 'Ngọn lửa đã tắt...';
      resultSummary.textContent =
        sim.gameOverReason === 'dawn'
          ? `Lúc bình minh chỉ còn ${litCount}/${sim.lanterns.length} đèn sáng (cần tối thiểu ${sim.getWinLitThreshold()}). Thử lại Đêm này nhé!`
          : 'Mây đã mất hết Ngọn Lửa. Giữ bình tĩnh và thử lại Đêm này!';
      btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
    }

    resLanterns.textContent = `${litCount} / ${sim.lanterns.length}`;
    resFlames.textContent = `${sim.player.flames} / ${TUNING.flames}`;
    resScore.textContent = String(sim.score);
    resTotalScore.textContent = String(campaignTotalScore);

    // Show leaderboard name submission after Night 3 Dawn victory OR loss on any Night (Phase 4 Section 3)
    const eligibleForLeaderboard = (won && currentNight === 3) || !won;
    lbSubmitBox.hidden = !eligibleForLeaderboard;
    lbNameInput.value = '';
    lbNameInput.disabled = false;
    btnLbSave.disabled = false;
    lbSubmitMsg.textContent = '';
    lbSubmitMsg.classList.remove('error');

    if (!resultDialog.open) resultDialog.showModal();
  }

  function isCodeBound(code: string): boolean {
    return ALL_ACTIONS.some((act) => settings.keybinds[act] === code);
  }

  function readInput(): InputState {
    const kb = settings.keybinds;
    const input = createDefaultInput();
    let forward = 0;
    let right = 0;
    if (
      pressedKeys.has(kb.forward) ||
      (kb.forward === 'KeyW' && !isCodeBound('ArrowUp') && pressedKeys.has('ArrowUp'))
    ) {
      forward += 1;
    }
    if (
      pressedKeys.has(kb.back) ||
      (kb.back === 'KeyS' && !isCodeBound('ArrowDown') && pressedKeys.has('ArrowDown'))
    ) {
      forward -= 1;
    }
    if (
      pressedKeys.has(kb.right) ||
      (kb.right === 'KeyD' && !isCodeBound('ArrowRight') && pressedKeys.has('ArrowRight'))
    ) {
      right += 1;
    }
    if (
      pressedKeys.has(kb.left) ||
      (kb.left === 'KeyA' && !isCodeBound('ArrowLeft') && pressedKeys.has('ArrowLeft'))
    ) {
      right -= 1;
    }

    input.move = [-right, forward];
    input.cam_yaw_deg = camYawDeg;
    input.jump = queuedJump;
    input.interact = queuedInteract;
    input.pulse = queuedPulse;
    input.dash = queuedDash;
    input.pause = queuedPauseToggle;

    queuedJump = false;
    queuedInteract = false;
    queuedPulse = false;
    queuedDash = false;
    queuedPauseToggle = false;
    return input;
  }

  function updateHud(nowMs: number): void {
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    hudNightName.textContent = sim.map.name;

    const flamesFilled = '🔥'.repeat(Math.max(0, sim.player.flames));
    const flamesEmpty = '○'.repeat(Math.max(0, TUNING.flames - sim.player.flames));
    hudFlames.textContent = `${flamesFilled}${flamesEmpty}`;

    const timeLeft = sim.getTimeLeftS();
    hudTime.textContent = formatTime(timeLeft);
    const isClockDanger = timeLeft <= 30 && sim.state === 'playing';
    hudClockBox.classList.toggle('danger', isClockDanger);
    hudClockWarn.hidden = !isClockDanger;

    const secCeil = Math.ceil(timeLeft);
    if (uiState === 'playing' && secCeil > 0 && secCeil <= 10 && secCeil !== lastCountdownSec) {
      lastCountdownSec = secCeil;
      sound.playCountdownTick();
    }

    hudLanterns.textContent = `${litCount} / ${sim.lanterns.length} (cần ${sim.getWinLitThreshold()})`;
    hudScore.textContent = String(sim.score);

    if (sim.player.charmTicks > 0) {
      hudCharmBadge.hidden = false;
      hudCharmTime.textContent = `${(sim.player.charmTicks / TICK_RATE).toFixed(1)}s`;
    } else {
      hudCharmBadge.hidden = true;
    }

    if (sim.wind.active) {
      hudWindBadge.hidden = false;
      hudWindBadge.textContent = `⚠ Gió mạnh! (${Math.round(sim.wind.dirDeg)}°)`;
    } else if (sim.wind.warning) {
      hudWindBadge.hidden = false;
      hudWindBadge.textContent = '⚠ Gió mạnh sắp thổi!';
      if (!windWarningSounded) {
        windWarningSounded = true;
        sound.playWindWarning();
      }
    } else {
      hudWindBadge.hidden = true;
      windWarningSounded = false;
    }

    const drainingShade = sim.shades.find((s) => s.state === 'drain' && s.targetLanternId);
    const lowFuelLanterns = sim.lanterns.filter((l) => l.lit && l.fuelUnits < LOW_FUEL_UNITS);
    if (drainingShade) {
      hudLowFuelBadge.hidden = false;
      hudLowFuelBadge.textContent = `⚠ Bóng Mực đang hút ${drainingShade.targetLanternId}!`;
    } else if (lowFuelLanterns.length > 0) {
      const worst = lowFuelLanterns.reduce((a, b) => (a.fuelUnits <= b.fuelUnits ? a : b));
      hudLowFuelBadge.hidden = false;
      hudLowFuelBadge.textContent = `⚠ ${worst.id} yếu dầu (${Math.floor(worst.fuelUnits / 60)}%)`;
    } else {
      hudLowFuelBadge.hidden = true;
    }

    // Visual Accessibility Subtitles (Shade spawn, Wind warning, Final 10s, Low-fuel < 30)
    if (uiState === 'playing' && sim.state === 'playing') {
      const cues: string[] = [];
      if (recentShadeSpawn && nowMs < recentShadeSpawn.expiresAtMs) {
        cues.push(`⚠ Bóng Mực ${recentShadeSpawn.id} xuất hiện!`);
      } else {
        recentShadeSpawn = null;
      }
      if (sim.wind.warning) cues.push('⚠ Gió mạnh sắp thổi!');
      if (secCeil > 0 && secCeil <= 10) cues.push(`⚠ Còn ${secCeil}s tới bình minh!`);
      if (lowFuelLanterns.length > 0) {
        const worst = lowFuelLanterns.reduce((a, b) => (a.fuelUnits <= b.fuelUnits ? a : b));
        cues.push(`⚠ ${worst.id} dầu < 30 (${Math.floor(worst.fuelUnits / 60)}%)`);
      }
      if (cues.length > 0) {
        hudSubtitle.hidden = false;
        hudSubtitle.textContent = cues.join(' · ');
      } else {
        hudSubtitle.hidden = true;
      }
    } else {
      hudSubtitle.hidden = true;
    }

    const carryCap = sim.getCarryCapacity();
    ensureMoteSlots(carryCap);
    hudCarriedText.textContent = `${sim.player.carried} / ${carryCap}`;
    for (let i = 0; i < carryCap; i++) {
      moteSlotEls[i].classList.toggle('filled', i < sim.player.carried);
    }

    const dashLeft = sim.player.charmTicks > 0 ? 0 : sim.player.dashCdTicks;
    const dashPct = ((DASH_COOLDOWN_TICKS - dashLeft) / DASH_COOLDOWN_TICKS) * 100;
    dashBar.style.width = `${Math.max(0, Math.min(100, dashPct))}%`;
    skillDashCard.classList.toggle('ready', dashLeft === 0 && sim.player.dashActiveTicks === 0);
    hudDashText.textContent =
      sim.player.charmTicks > 0
        ? 'Không hồi chiêu!'
        : dashLeft > 0
          ? `Hồi ${(dashLeft / TICK_RATE).toFixed(1)}s`
          : 'Sẵn sàng';

    const pulseLeft = sim.player.pulseCdTicks;
    const pulsePct = ((PULSE_COOLDOWN_TICKS - pulseLeft) / PULSE_COOLDOWN_TICKS) * 100;
    pulseBar.style.width = `${Math.max(0, Math.min(100, pulsePct))}%`;
    skillPulseCard.classList.toggle('ready', pulseLeft === 0 && sim.player.carried >= TUNING.pulse_cost);
    if (pulseLeft > 0) {
      hudPulseText.textContent = `Hồi ${(pulseLeft / TICK_RATE).toFixed(1)}s`;
    } else if (sim.player.carried < TUNING.pulse_cost) {
      hudPulseText.textContent = `Cần ${TUNING.pulse_cost} đom đóm`;
    } else {
      hudPulseText.textContent = 'Sẵn sàng (3)';
    }

    const nearbyReceivable = sim.lanterns.find(
      (l) =>
        (!l.lit || l.fuelUnits < FUEL_MAX_UNITS) &&
        distXZ(sim.player.pos, l.pos) <= TUNING.interact_radius &&
        Math.abs(sim.player.pos[1] - l.pos[1]) <= INTERACT_HEIGHT_TOLERANCE,
    );
    if (nearbyReceivable && uiState === 'playing' && sim.player.fallRespawnTicks === 0) {
      const kLbl = formatKeyCode(settings.keybinds.interact);
      hudPrompt.hidden = false;
      if (!nearbyReceivable.lit) {
        const cost = nearbyReceivable.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
        const action = nearbyReceivable.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
        hudPrompt.textContent = `${kLbl} — ${action} ${nearbyReceivable.id} (${nearbyReceivable.deposited}/${cost})`;
      } else {
        hudPrompt.textContent = `${kLbl} — Châm dầu ${nearbyReceivable.id} (còn ${Math.floor(nearbyReceivable.fuelUnits / 60)}%)`;
      }
    } else {
      hudPrompt.hidden = true;
    }

    // Off-screen indicators: urgent/unlit lantern + newly spawned Shade arrow
    if (uiState === 'playing') {
      const vw = canvasRoot.clientWidth;
      const vh = canvasRoot.clientHeight;
      const arrow = renderer.getOffscreenLanternIndicator(sim, vw, vh);
      offscreenArrow.hidden = !arrow.visible;
      if (arrow.visible) {
        offscreenArrow.style.left = `${arrow.x}px`;
        offscreenArrow.style.top = `${arrow.y}px`;
        offscreenArrow.style.transform = 'translate(-50%, -50%)';
        offscreenArrowHead.style.transform = `rotate(${arrow.angleDeg}deg)`;
        offscreenArrowLabel.textContent = arrow.label;
      }

      if (recentShadeSpawn && nowMs < recentShadeSpawn.expiresAtMs) {
        const liveShade = sim.shades.find((s) => s.id === recentShadeSpawn?.id);
        const pos = liveShade ? liveShade.pos : recentShadeSpawn.pos;
        const sArrow = renderer.getOffscreenPointIndicator(pos, `⚠ ${recentShadeSpawn.id}`, vw, vh);
        shadeSpawnArrow.hidden = !sArrow.visible;
        if (sArrow.visible) {
          shadeSpawnArrow.style.left = `${sArrow.x}px`;
          shadeSpawnArrow.style.top = `${sArrow.y}px`;
          shadeSpawnArrow.style.transform = 'translate(-50%, -50%)';
          shadeSpawnArrowHead.style.transform = `rotate(${sArrow.angleDeg}deg)`;
          shadeSpawnArrowLabel.textContent = sArrow.label;
        }
      } else {
        shadeSpawnArrow.hidden = true;
      }
    } else {
      offscreenArrow.hidden = true;
      shadeSpawnArrow.hidden = true;
    }
  }

  // Keyboard handlers (supports custom keybindings + conflict detection inside Settings)
  window.addEventListener('keydown', (e) => {
    if (settingsDialog.open && listeningAction !== null) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        listeningAction = null;
        keybindStatus.hidden = true;
        renderKeybindsEditor();
        return;
      }
      const conflict = ALL_ACTIONS.find(
        (act) => act !== listeningAction && settings.keybinds[act] === e.code,
      );
      if (conflict) {
        keybindStatus.classList.remove('info');
        keybindStatus.hidden = false;
        keybindStatus.textContent = `⚠ Phím [${formatKeyCode(e.code)}] đang trùng với "${ACTION_LABELS[conflict]}"! Hãy chọn phím khác.`;
        return;
      }
      settings.keybinds[listeningAction] = e.code;
      listeningAction = null;
      keybindStatus.classList.remove('info');
      keybindStatus.hidden = true;
      saveSettings(settings);
      updateKeybindLabels();
      renderKeybindsEditor();
      return;
    }

    const kb = settings.keybinds;
    if (e.code === kb.pause || e.code === 'Escape') {
      if (uiState === 'playing') {
        e.preventDefault();
        togglePauseUi();
        return;
      }
      if (uiState === 'paused' && !settingsDialog.open && e.code === kb.pause) {
        e.preventDefault();
        togglePauseUi();
        return;
      }
    }

    if (uiState !== 'playing') return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', kb.jump].includes(e.code)) {
      e.preventDefault();
    }
    if (!e.repeat) {
      if (e.code === kb.jump) {
        queuedJump = true;
        if (sim.player.grounded) sound.playJump();
      }
      if (
        e.code === kb.interact ||
        (kb.interact === 'KeyE' && !isCodeBound('KeyF') && e.code === 'KeyF')
      ) {
        queuedInteract = true;
      }
      if (e.code === kb.pulse) queuedPulse = true;
      if (
        e.code === kb.dash ||
        (kb.dash === 'ShiftLeft' && !isCodeBound('ShiftRight') && e.code === 'ShiftRight')
      ) {
        queuedDash = true;
      }
    }
    pressedKeys.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    pressedKeys.clear();
    lastPointerX = null;
    lastPointerY = null;
  });

  canvasRoot.addEventListener('click', () => {
    if (uiState === 'playing') tryRequestPointerLock();
  });

  window.addEventListener('pointermove', (e) => {
    if (uiState !== 'playing') {
      lastPointerX = null;
      lastPointerY = null;
      return;
    }
    let dx = 0;
    let dy = 0;
    if (document.pointerLockElement === canvasRoot) {
      dx = e.movementX;
      dy = e.movementY;
    } else {
      if (lastPointerX !== null && lastPointerY !== null) {
        dx = e.clientX - lastPointerX;
        dy = e.clientY - lastPointerY;
      }
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
    }
    if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return;

    const scale = settings.sensitivity * 0.65;
    camYawDeg = (camYawDeg - dx * scale) % 360;
    const minPitch = targetCamDist < 7 ? 4 : 16;
    camPitchDeg = Math.max(minPitch, Math.min(56, camPitchDeg + dy * scale * 0.55));
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (uiState !== 'playing') return;
      e.preventDefault();
      const step = Math.sign(e.deltaY) * 1.15;
      targetCamDist = Math.max(2.6, Math.min(24.0, targetCamDist + step));
    },
    { passive: false },
  );

  document.addEventListener('pointerlockchange', () => {
    lastPointerX = null;
    lastPointerY = null;
    if (document.pointerLockElement !== canvasRoot && uiState === 'playing') {
      togglePauseUi();
    }
  });

  // UI Button & Dialog Listeners
  btnStartCampaign.addEventListener('click', () => {
    sound.startBgm();
    startNight(1, true);
  });

  menuDialog.querySelectorAll<HTMLButtonElement>('[data-night]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.startBgm();
      const n = Number(btn.dataset.night) as NightNumber;
      startNight(n, true);
    });
  });

  btnOpenLeaderboard.addEventListener('click', () => {
    openLeaderboardDialog().catch(() => {});
  });

  leaderboardDialog.addEventListener('close', () => {
    leaderboardDialog.returnValue = '';
    if (uiState === 'menu') menuDialog.showModal();
  });

  btnOpenSettingsMenu.addEventListener('click', () => {
    settingsReturnTo = 'menu';
    listeningAction = null;
    keybindStatus.hidden = true;
    renderKeybindsEditor();
    menuDialog.close();
    settingsDialog.showModal();
  });

  btnOpenSettingsPause.addEventListener('click', () => {
    settingsReturnTo = 'paused';
    listeningAction = null;
    keybindStatus.hidden = true;
    renderKeybindsEditor();
    pauseDialog.close();
    settingsDialog.showModal();
  });

  volumeSlider.addEventListener('input', () => {
    settings.volume = Number(volumeSlider.value);
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  sensSlider.addEventListener('input', () => {
    settings.sensitivity = Number(sensSlider.value) / 100;
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  colorblindCheckbox.addEventListener('change', () => {
    settings.colorblind = colorblindCheckbox.checked;
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  reducedMotionCheckbox.addEventListener('change', () => {
    settings.reducedMotion = reducedMotionCheckbox.checked;
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  largeTextCheckbox.addEventListener('change', () => {
    settings.largeText = largeTextCheckbox.checked;
    applyAccessibilitySettings();
    saveSettings(settings);
  });

  btnResetKeybinds.addEventListener('click', () => {
    settings.keybinds = { ...DEFAULT_KEYBINDS };
    listeningAction = null;
    keybindStatus.classList.add('info');
    keybindStatus.hidden = false;
    keybindStatus.textContent = 'Đã khôi phục phím điều khiển mặc định.';
    saveSettings(settings);
    updateKeybindLabels();
    renderKeybindsEditor();
  });

  menuDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
  });

  settingsDialog.addEventListener('cancel', (e) => {
    if (listeningAction !== null) {
      e.preventDefault();
      listeningAction = null;
      keybindStatus.hidden = true;
      renderKeybindsEditor();
    }
  });

  settingsDialog.addEventListener('close', () => {
    settingsDialog.returnValue = '';
    listeningAction = null;
    if (settingsReturnTo === 'menu') {
      menuDialog.showModal();
    } else {
      pauseDialog.showModal();
    }
  });

  introDialog.addEventListener('close', () => {
    introDialog.returnValue = '';
    uiState = 'playing';
    accumulator = 0;
    lastFrameMs = performance.now();
    lastPointerX = null;
    lastPointerY = null;
    sound.startBgm();
    tryRequestPointerLock();
    showToast(`${sim.map.name} bắt đầu!`);
  });

  btnPauseHud.addEventListener('click', () => togglePauseUi());
  btnResume.addEventListener('click', () => togglePauseUi());
  btnRestartNight.addEventListener('click', () => startNight(currentNight, false));
  btnBackMenu.addEventListener('click', () => openMainMenu());

  pauseDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    togglePauseUi();
  });

  btnLbSave.addEventListener('click', async () => {
    if (lbSavedThisResult) return;
    const rawName = lbNameInput.value;
    const check = validateLeaderboardName(rawName);
    if (!check.valid) {
      lbSubmitMsg.textContent = `⚠ ${check.reason}`;
      lbSubmitMsg.classList.add('error');
      return;
    }
    btnLbSave.disabled = true;
    const entry: LeaderboardEntry = {
      name: rawName.trim(),
      score: campaignTotalScore,
      nights_won: campaignNightsWon,
      achieved_at: formatIsoWithTimezone(),
      seed: campaignSeed,
    };
    try {
      await persistLeaderboardEntry(entry);
      lbSavedThisResult = true;
      lbNameInput.disabled = true;
      lbSubmitMsg.classList.remove('error');
      lbSubmitMsg.textContent = `Đã lưu thành tích của "${entry.name}" (${entry.score} điểm) vào Bảng xếp hạng!`;
    } catch {
      btnLbSave.disabled = false;
      lbSubmitMsg.classList.add('error');
      lbSubmitMsg.textContent = '⚠ Không thể lưu điểm. Thử lại sau.';
    }
  });

  btnResultMenu.addEventListener('click', () => openMainMenu());
  btnResultPrimary.addEventListener('click', () => {
    if (sim.state === 'won' && currentNight < 3) {
      startNight((currentNight + 1) as NightNumber, false);
    } else if (sim.state === 'won' && currentNight === 3) {
      startNight(1, true);
    } else {
      startNight(currentNight, false);
    }
  });

  resultDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
  });

  resultDialog.addEventListener('close', () => {
    resultDialog.returnValue = '';
  });

  window.addEventListener('resize', () => {
    renderer.resize(canvasRoot.clientWidth, canvasRoot.clientHeight);
  });

  menuDialog.showModal();

  let accumulator = 0;
  let lastFrameMs = performance.now();
  let fpsFrames = 0;
  let fpsSampleMs = lastFrameMs;

  function loop(nowMs: number): void {
    const frameDt = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
    lastFrameMs = nowMs;

    fpsFrames += 1;
    if (nowMs - fpsSampleMs >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (nowMs - fpsSampleMs));
      hudFps.textContent = `${fps} FPS`;
      fpsFrames = 0;
      fpsSampleMs = nowMs;
    }

    if (uiState === 'playing' && sim.state === 'playing') {
      if (!isCodeBound('KeyJ') && pressedKeys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
      if (!isCodeBound('KeyL') && pressedKeys.has('KeyL')) camYawDeg = (camYawDeg - 110 * frameDt) % 360;

      accumulator += frameDt;
      while (accumulator >= DT) {
        const events = sim.step(readInput());
        accumulator -= DT;

        for (const ev of events) {
          if (ev.name === 'dash') {
            sound.playDash();
          } else if (ev.name === 'mote_picked') {
            sound.playPickup(ev.data.carried);
            renderer.triggerPickupSparkle(sim.player.pos);
          } else if (ev.name === 'charm_picked') {
            sound.playCharm();
            showToast('Bùa Gió kích hoạt! Tốc độ 7.2 m/s & Lướt không hồi chiêu (10s)!');
          } else if (ev.name === 'deposit') {
            sound.playDeposit();
          } else if (ev.name === 'lantern_lit') {
            const litCount = sim.lanterns.filter((l) => l.lit).length;
            sound.playLanternLit(litCount);
            const tag = ev.data.relight ? 'Thắp lại' : 'Thắp sáng';
            showToast(
              `${tag} ${ev.data.lantern_id}! (${litCount}/${sim.lanterns.length}) · Sức chứa: ${sim.getCarryCapacity()}`,
            );
          } else if (ev.name === 'refuel') {
            sound.playRefuel();
            showToast(`Đã châm +${ev.data.amount} đom đóm vào ${ev.data.lantern_id} (dầu ${ev.data.fuel}%)`);
          } else if (ev.name === 'lantern_out') {
            sound.playLanternOut();
            showToast(`⚠ ${ev.data.lantern_id} đã cạn dầu và tắt! (Thắp lại chỉ cần 5 đom đóm)`);
          } else if (ev.name === 'fuel_drain') {
            sound.playDrainAlert();
            showToast(`⚠ Bóng Mực ${ev.data.shade_id} đang hút dầu ${ev.data.lantern_id} (${ev.data.fuel}%)!`);
          } else if (ev.name === 'pulse') {
            sound.playPulse();
            renderer.triggerPulseEffect(sim.player.pos);
            renderer.triggerCameraShake(0.18);
            triggerScreenFlash('pulse');
            const count = ev.data.stunned_ids.length;
            if (count > 0) showToast(`Tỏa Sáng làm choáng ${count} Bóng Mực!`);
          } else if (ev.name === 'drifter_steal') {
            sound.playDrifterSteal();
            showToast(`Gió Lạc ${ev.data.drifter_id} vừa cướp ${ev.data.amount} đom đóm!`);
          } else if (ev.name === 'drifter_drop') {
            sound.playDrifterDrop();
            showToast(`Gió Lạc đánh rơi lại ${ev.data.amount} đom đóm!`);
          } else if (ev.name === 'player_hit') {
            sound.playHit();
            renderer.triggerCameraShake(0.32);
            triggerScreenFlash('hit');
            if (ev.data.by === 'fall') {
              showToast(`Mây rơi xuống biển mây! Mất ${ev.data.lost} đom đóm, còn ${ev.data.flames} Ngọn Lửa.`);
            } else {
              showToast(`Bị Bóng Mực chạm! Rơi ${ev.data.dropped} đom đóm, còn ${ev.data.flames} Ngọn Lửa.`);
            }
          } else if (ev.name === 'shade_spawned') {
            sound.playShadeSpawn();
            const spawnedShade = sim.shades.find((s) => s.id === ev.data.id);
            if (spawnedShade) {
              recentShadeSpawn = {
                id: spawnedShade.id,
                pos: [...spawnedShade.pos],
                expiresAtMs: nowMs + 3500,
              };
            }
          }
        }

        const stateAfter: string = sim.state;
        if (stateAfter === 'won' || stateAfter === 'lost') {
          accumulator = 0;
          break;
        }
      }
    }

    if ((sim.state === 'won' || sim.state === 'lost') && !resultShown && uiState === 'playing') {
      showResultDialog();
    }

    camDist += (targetCamDist - camDist) * Math.min(1, frameDt * 12);
    updateHud(nowMs);
    renderer.sync(sim, camYawDeg, camPitchDeg, camDist, frameDt);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
