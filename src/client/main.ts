import './style.css';
import { createDefaultInput, distXZ, LanternIslandSim } from '../sim/engine.js';
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
import type { InputState, NightNumber } from '../sim/types.js';
import { SoundEngine } from './audio.js';
import { LanternIslandRenderer } from './scene.js';

interface UserSettings {
  volume: number; // 0..100
  sensitivity: number; // 0.15..1.0
  colorblind: boolean;
}

const SETTINGS_KEY = 'dao_den_long_settings_v1';

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : 70,
        sensitivity:
          typeof parsed.sensitivity === 'number'
            ? Math.max(0.15, Math.min(1.0, parsed.sensitivity))
            : 0.4,
        colorblind: typeof parsed.colorblind === 'boolean' ? parsed.colorblind : false,
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 70, sensitivity: 0.4, colorblind: false };
}

function saveSettings(s: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

const canvasRoot = document.getElementById('canvas-root')!;
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

const btnPauseHud = document.getElementById('btn-pause-hud') as HTMLButtonElement;
const menuDialog = document.getElementById('menu-dialog') as HTMLDialogElement;
const btnStartCampaign = document.getElementById('btn-start-campaign') as HTMLButtonElement;
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

const resultDialog = document.getElementById('result-dialog') as HTMLDialogElement;
const resultEyebrow = document.getElementById('result-eyebrow')!;
const resultTitle = document.getElementById('result-dialog-title')!;
const resultSummary = document.getElementById('result-summary')!;
const resLanterns = document.getElementById('res-lanterns')!;
const resFlames = document.getElementById('res-flames')!;
const resScore = document.getElementById('res-score')!;
const resTotalScore = document.getElementById('res-total-score')!;
const btnResultMenu = document.getElementById('btn-result-menu') as HTMLButtonElement;
const btnResultPrimary = document.getElementById('btn-result-primary') as HTMLButtonElement;

// Build dynamic mote bar (10..20 slots as successful_lights grows)
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
sound.setVolume(settings.volume / 100);
volumeSlider.value = String(settings.volume);
volumeVal.textContent = `${settings.volume}%`;
sensSlider.value = String(Math.round(settings.sensitivity * 100));
sensVal.textContent = settings.sensitivity.toFixed(2);
colorblindCheckbox.checked = settings.colorblind;

const renderer = new LanternIslandRenderer(canvasRoot);
function applyColorblindMode(enabled: boolean): void {
  document.body.classList.toggle('colorblind', enabled);
  renderer.setColorblind(enabled);
}
applyColorblindMode(settings.colorblind);

let currentNight: NightNumber = 1;
let runSeedCounter = 1;
let campaignTotalScore = 0;
let sim = new LanternIslandSim({ seed: 202611, night: 1 });
renderer.resetForNight(1);

let camYawDeg = 0;
let camPitchDeg = 32;
let camDist = 15.5;
let targetCamDist = 15.5;
let uiState: 'menu' | 'intro' | 'playing' | 'paused' | 'result' = 'menu';
let settingsReturnTo: 'menu' | 'paused' = 'menu';
let resultShown = false;
let toastTimer: number | null = null;
let lastCountdownSec = -1;
let windWarningSounded = false;

const pressedKeys = new Set<string>();
let queuedJump = false;
let queuedInteract = false;
let queuedPulse = false;
let queuedDash = false;
let queuedPauseToggle = false;

let lastPointerX: number | null = null;
let lastPointerY: number | null = null;

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
      if (res && typeof res.catch === 'function') res.catch(() => { });
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
  for (const d of [menuDialog, introDialog, pauseDialog, settingsDialog, resultDialog]) {
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

function startNight(night: NightNumber, resetCampaignScore: boolean): void {
  releasePointerLock();
  if (resetCampaignScore) campaignTotalScore = 0;
  currentNight = night;
  runSeedCounter += 1;
  sim = new LanternIslandSim({ seed: 202600 + night * 100 + runSeedCounter, night });
  renderer.resetForNight(night);
  camYawDeg = 0;
  camPitchDeg = 32;
  camDist = 15.5;
  targetCamDist = 15.5;
  resultShown = false;
  lastCountdownSec = -1;
  windWarningSounded = false;
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
      'Đèn dưới 30 dầu mất vùng an toàn 6m và bị Bóng Mực hút 5 dầu/giây; Tỏa Sáng (Q) trúng con đang hút nhận +15 điểm!',
      'Mỗi lần thắp đèn thành công tăng sức chứa thêm +2 (tối đa 20); đèn đã từng sáng chỉ tốn 5 đom đóm để thắp lại!',
    ],
    2: [
      'Giữ tối thiểu 4/6 Đèn Lồng sáng tới bình minh (4 phút 30 giây) trên hai hòn đảo nối bằng cầu tre và 2 bục gió.',
      'Nhặt Bùa Gió đỏ viền vàng trên cầu tre để tăng tốc 7.2 m/s và Lướt không hồi chiêu trong 10 giây.',
      'Gió Lạc bay nhanh và cướp đom đóm khi bạn mang ≥ 5 đốm — dùng Tỏa Sáng để bắt nó nhả lại!',
    ],
    3: [
      'Giữ tối thiểu 5/7 Đèn Lồng sáng tới bình minh (5 phút) trên Đảo Chuông 3 tầng — leo 2 con dốc và dùng bục nhảy lên đỉnh.',
      'Mỗi 30 giây có một cơn gió mạnh đẩy 2 m/s trong 5 giây (báo trước 2 giây bằng lá vàng bay).',
      'Bóng Mực Đêm 3 nhanh hơn (4.5 m/s) và sẽ lao tới hút dầu bất kỳ đèn nào tụt dưới 30 — nhớ tuần tra châm dầu đều đặn!',
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
    // Send rising edge pause=true then release pause=false so prevInput.pause resets cleanly while sim_tick stays frozen
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
      // Ensure pause button is released before rising edge resume
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
  uiState = 'result';
  pressedKeys.clear();
  lastPointerX = null;
  lastPointerY = null;

  const litCount = sim.lanterns.filter((l) => l.lit).length;
  const won = sim.state === 'won';
  if (won) {
    campaignTotalScore += sim.score;
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

  if (!resultDialog.open) resultDialog.showModal();
}

function readInput(): InputState {
  const input = createDefaultInput();
  let forward = 0;
  let right = 0;
  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) forward += 1;
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) forward -= 1;
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) right += 1;
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) right -= 1;

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

function updateHud(): void {
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

  // Final 10-second countdown audio cue
  const secCeil = Math.ceil(timeLeft);
  if (uiState === 'playing' && secCeil > 0 && secCeil <= 10 && secCeil !== lastCountdownSec) {
    lastCountdownSec = secCeil;
    sound.playCountdownTick();
  }

  hudLanterns.textContent = `${litCount} / ${sim.lanterns.length} (cần ${sim.getWinLitThreshold()})`;
  hudScore.textContent = String(sim.score);

  // Charm, Wind & Low-Fuel/Drain warning badges
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
    hudWindBadge.textContent = '⚠ Cảnh báo: Gió mạnh sắp tới!';
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
    hudLowFuelBadge.textContent = `⚠ Bóng Mực đang hút dầu ${drainingShade.targetLanternId}!`;
  } else if (lowFuelLanterns.length > 0) {
    const worst = lowFuelLanterns.reduce((a, b) => (a.fuelUnits <= b.fuelUnits ? a : b));
    hudLowFuelBadge.hidden = false;
    hudLowFuelBadge.textContent = `⚠ ${worst.id} sắp cạn dầu (${Math.floor(worst.fuelUnits / 60)}%)`;
  } else {
    hudLowFuelBadge.hidden = true;
  }

  // Dynamic capacity mote bar (10..20 slots)
  const carryCap = sim.getCarryCapacity();
  ensureMoteSlots(carryCap);
  hudCarriedText.textContent = `${sim.player.carried} / ${carryCap}`;
  for (let i = 0; i < carryCap; i++) {
    moteSlotEls[i].classList.toggle('filled', i < sim.player.carried);
  }

  // Dash cooldown
  const dashLeft = sim.player.charmTicks > 0 ? 0 : sim.player.dashCdTicks;
  const dashPct = ((DASH_COOLDOWN_TICKS - dashLeft) / DASH_COOLDOWN_TICKS) * 100;
  dashBar.style.width = `${Math.max(0, Math.min(100, dashPct))}%`;
  const dashReady = dashLeft === 0 && sim.player.dashActiveTicks === 0;
  skillDashCard.classList.toggle('ready', dashReady);
  hudDashText.textContent =
    sim.player.charmTicks > 0
      ? 'Không hồi chiêu!'
      : dashLeft > 0
        ? `Hồi ${(dashLeft / TICK_RATE).toFixed(1)}s`
        : 'Sẵn sàng';

  // Pulse cooldown
  const pulseLeft = sim.player.pulseCdTicks;
  const pulsePct = ((PULSE_COOLDOWN_TICKS - pulseLeft) / PULSE_COOLDOWN_TICKS) * 100;
  pulseBar.style.width = `${Math.max(0, Math.min(100, pulsePct))}%`;
  const pulseReady = pulseLeft === 0 && sim.player.carried >= TUNING.pulse_cost;
  skillPulseCard.classList.toggle('ready', pulseReady);
  if (pulseLeft > 0) {
    hudPulseText.textContent = `Hồi ${(pulseLeft / TICK_RATE).toFixed(1)}s`;
  } else if (sim.player.carried < TUNING.pulse_cost) {
    hudPulseText.textContent = `Cần ${TUNING.pulse_cost} đom đóm`;
  } else {
    hudPulseText.textContent = 'Sẵn sàng (3 đom đóm)';
  }

  // Contextual lantern interact prompt: unlit (10 or relight 5) OR lit with fuel < 100
  const nearbyReceivable = sim.lanterns.find(
    (l) =>
      (!l.lit || l.fuelUnits < FUEL_MAX_UNITS) &&
      distXZ(sim.player.pos, l.pos) <= TUNING.interact_radius &&
      Math.abs(sim.player.pos[1] - l.pos[1]) <= INTERACT_HEIGHT_TOLERANCE,
  );
  if (nearbyReceivable && uiState === 'playing' && sim.player.fallRespawnTicks === 0) {
    hudPrompt.hidden = false;
    if (!nearbyReceivable.lit) {
      const cost = nearbyReceivable.everLit ? TUNING.relight_cost : TUNING.lantern_cost;
      const action = nearbyReceivable.everLit ? 'Thắp lại' : 'Nạp ánh sáng';
      hudPrompt.textContent = `E — ${action} ${nearbyReceivable.id} (${nearbyReceivable.deposited}/${cost})`;
    } else {
      const fuelPct = Math.floor(nearbyReceivable.fuelUnits / 60);
      hudPrompt.textContent = `E — Châm dầu ${nearbyReceivable.id} (còn ${fuelPct}%)`;
    }
  } else {
    hudPrompt.hidden = true;
  }

  // Off-screen unlit lantern arrow
  if (uiState === 'playing') {
    const arrow = renderer.getOffscreenLanternIndicator(
      sim,
      canvasRoot.clientWidth,
      canvasRoot.clientHeight,
    );
    offscreenArrow.hidden = !arrow.visible;
    if (arrow.visible) {
      offscreenArrow.style.left = `${arrow.x}px`;
      offscreenArrow.style.top = `${arrow.y}px`;
      offscreenArrow.style.transform = 'translate(-50%, -50%)';
      offscreenArrowHead.style.transform = `rotate(${arrow.angleDeg}deg)`;
      offscreenArrowLabel.textContent = arrow.label;
    }
  } else {
    offscreenArrow.hidden = true;
  }
}

// Keyboard handlers
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (uiState === 'playing') {
      e.preventDefault();
      togglePauseUi();
      return;
    }
    if (uiState === 'paused' && !settingsDialog.open && e.code === 'KeyP') {
      e.preventDefault();
      togglePauseUi();
      return;
    }
  }

  if (uiState !== 'playing') return;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (!e.repeat) {
    if (e.code === 'Space') {
      queuedJump = true;
      if (sim.player.grounded) sound.playJump();
    }
    if (e.code === 'KeyE' || e.code === 'KeyF') queuedInteract = true;
    if (e.code === 'KeyQ') queuedPulse = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') queuedDash = true;
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

// Free mouse-look camera (no click-and-hold required; click canvas for infinite 360° Pointer Lock)
canvasRoot.addEventListener('click', () => {
  if (uiState === 'playing') {
    tryRequestPointerLock();
  }
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

  // Clamp sudden cursor jumps when re-entering viewport
  if (Math.abs(dx) > 160 || Math.abs(dy) > 160) return;

  const scale = settings.sensitivity * 0.65;
  camYawDeg = (camYawDeg - dx * scale) % 360;
  const minPitch = targetCamDist < 7 ? 4 : 16;
  camPitchDeg = Math.max(minPitch, Math.min(56, camPitchDeg + dy * scale * 0.55));
});

// Mouse-wheel zoom in/out toward character (2.6m close-up <-> 24m overview)
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

// If user presses Esc while Pointer Lock is active, browser unlocks cursor -> pause cleanly
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

btnOpenSettingsMenu.addEventListener('click', () => {
  settingsReturnTo = 'menu';
  menuDialog.close();
  settingsDialog.showModal();
});

btnOpenSettingsPause.addEventListener('click', () => {
  settingsReturnTo = 'paused';
  pauseDialog.close();
  settingsDialog.showModal();
});

volumeSlider.addEventListener('input', () => {
  settings.volume = Number(volumeSlider.value);
  volumeVal.textContent = `${settings.volume}%`;
  sound.setVolume(settings.volume / 100);
  saveSettings(settings);
});

sensSlider.addEventListener('input', () => {
  settings.sensitivity = Number(sensSlider.value) / 100;
  sensVal.textContent = settings.sensitivity.toFixed(2);
  saveSettings(settings);
});

colorblindCheckbox.addEventListener('change', () => {
  settings.colorblind = colorblindCheckbox.checked;
  applyColorblindMode(settings.colorblind);
  saveSettings(settings);
});

settingsDialog.addEventListener('close', () => {
  settingsDialog.returnValue = '';
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

resultDialog.addEventListener('close', () => {
  resultDialog.returnValue = '';
});

window.addEventListener('resize', () => {
  renderer.resize(canvasRoot.clientWidth, canvasRoot.clientHeight);
});

// Start at Main Menu
menuDialog.showModal();

// Fixed 60Hz sim loop + FPS tracker
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
    if (pressedKeys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
    if (pressedKeys.has('KeyL')) camYawDeg = (camYawDeg - 110 * frameDt) % 360;

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
          if (ev.data.by === 'fall') {
            showToast(`Mây rơi xuống biển mây! Mất ${ev.data.lost} đom đóm, còn ${ev.data.flames} Ngọn Lửa.`);
          } else {
            showToast(`Bị Bóng Mực chạm! Rơi ${ev.data.dropped} đom đóm, còn ${ev.data.flames} Ngọn Lửa.`);
          }
        } else if (ev.name === 'shade_spawned') {
          sound.playShadeSpawn();
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
  updateHud();
  renderer.sync(sim, camYawDeg, camPitchDeg, camDist, frameDt);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
