import './style.css';
import { createDefaultInput, distXZ, LanternIslandSim } from '../sim/engine.js';
import { DT, TICK_RATE, TUNING } from '../sim/tuning.js';
import type { InputState } from '../sim/types.js';
import { SoundEngine } from './audio.js';
import { LanternIslandRenderer } from './scene.js';

const canvasRoot = document.getElementById('canvas-root')!;
const hudFlames = document.getElementById('hud-flames')!;
const hudCarried = document.getElementById('hud-carried')!;
const hudLanterns = document.getElementById('hud-lanterns')!;
const hudTime = document.getElementById('hud-time')!;
const hudScore = document.getElementById('hud-score')!;
const hudPrompt = document.getElementById('hud-prompt')!;
const hudLive = document.getElementById('hud-live')!;
const pulseBar = document.getElementById('pulse-bar')!;
const hudPulseText = document.getElementById('hud-pulse-text')!;

const btnMute = document.getElementById('btn-mute') as HTMLButtonElement;
const btnHelp = document.getElementById('btn-help') as HTMLButtonElement;
const btnRestartHud = document.getElementById('btn-restart-hud') as HTMLButtonElement;

const helpDialog = document.getElementById('help-dialog') as HTMLDialogElement;
const resultDialog = document.getElementById('result-dialog') as HTMLDialogElement;
const resultTitle = document.getElementById('result-dialog-title')!;
const resultSummary = document.getElementById('result-summary')!;
const resLanterns = document.getElementById('res-lanterns')!;
const resFlames = document.getElementById('res-flames')!;
const resTime = document.getElementById('res-time')!;
const resScore = document.getElementById('res-score')!;

const sound = new SoundEngine();
const renderer = new LanternIslandRenderer(canvasRoot);

let runCounter = 1;
let sim = new LanternIslandSim({ seed: 202601 });
let camYawDeg = 0;
let pausedForDialog = true;
let resultShown = false;
let toastTimer: number | null = null;

const pressedKeys = new Set<string>();
let queuedInteract = false;
let queuedPulse = false;
let queuedJump = false;

let isDraggingCamera = false;
let lastPointerX = 0;

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

function restartGame(): void {
  runCounter += 1;
  sim = new LanternIslandSim({ seed: 202600 + runCounter });
  camYawDeg = 0;
  resultShown = false;
  pausedForDialog = false;
  queuedInteract = false;
  queuedPulse = false;
  queuedJump = false;
  if (resultDialog.open) resultDialog.close();
  if (helpDialog.open) helpDialog.close();
  showToast('Đêm 1 bắt đầu! Hãy gom đom đóm để thắp 5 Đèn Lồng Lớn.');
}

function showResultDialog(): void {
  resultShown = true;
  pausedForDialog = true;
  const litCount = sim.lanterns.filter((l) => l.lit).length;

  if (sim.state === 'won') {
    resultTitle.textContent = 'Đảo Bến đã bừng sáng!';
    resultSummary.textContent =
      'Mây đã thắp sáng toàn bộ 5 Đèn Lồng Lớn, xua tan sương đen khỏi Đảo Bến.';
    sound.playWin();
  } else {
    resultTitle.textContent =
      sim.gameOverReason === 'dawn' ? 'Bình minh đã tới...' : 'Ngọn lửa đã tắt...';
    resultSummary.textContent =
      sim.gameOverReason === 'dawn'
        ? 'Thời gian Đêm 1 đã hết trước khi thắp đủ 5 đèn lồng.'
        : 'Mây đã mất hết ngọn lửa trước Bóng Mực. Hãy thử lại nhé!';
    sound.playLose();
  }

  resLanterns.textContent = `${litCount} / ${sim.lanterns.length}`;
  resFlames.textContent = `${sim.player.flames} / ${TUNING.flames}`;
  resTime.textContent = formatTime(sim.getTimeLeftS());
  resScore.textContent = String(sim.score);

  if (!resultDialog.open) {
    resultDialog.showModal();
  }
}

function readInput(): InputState {
  const input = createDefaultInput();
  let forward = 0;
  let right = 0;
  if (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp')) forward += 1;
  if (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown')) forward -= 1;
  if (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight')) right += 1;
  if (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft')) right -= 1;

  // Screen right maps to -X in sim world when looking along +Z
  input.move = [-right, forward];
  input.cam_yaw_deg = camYawDeg;
  input.jump = queuedJump;
  input.interact = queuedInteract;
  input.pulse = queuedPulse;

  queuedJump = false;
  queuedInteract = false;
  queuedPulse = false;

  return input;
}

function updateHud(): void {
  const litCount = sim.lanterns.filter((l) => l.lit).length;
  const flamesFilled = '🔥'.repeat(Math.max(0, sim.player.flames));
  const flamesEmpty = '○'.repeat(Math.max(0, TUNING.flames - sim.player.flames));
  hudFlames.textContent = `${flamesFilled}${flamesEmpty}`;
  hudCarried.textContent = `${sim.player.carried} / ${TUNING.carry_capacity}`;
  hudLanterns.textContent = `${litCount} / ${sim.lanterns.length}`;
  hudTime.textContent = formatTime(sim.getTimeLeftS());
  hudScore.textContent = String(sim.score);

  const maxCd = Math.round(TUNING.pulse_cooldown_s * TICK_RATE);
  const cdLeft = sim.player.pulseCooldownTicks;
  const readyPct = maxCd > 0 ? Math.max(0, Math.min(100, ((maxCd - cdLeft) / maxCd) * 100)) : 100;
  pulseBar.style.width = `${readyPct}%`;

  if (cdLeft > 0) {
    hudPulseText.textContent = `Hồi chiêu ${(cdLeft / TICK_RATE).toFixed(1)}s`;
  } else if (sim.player.carried < TUNING.pulse_cost) {
    hudPulseText.textContent = `Cần ${TUNING.pulse_cost} đom đóm`;
  } else {
    hudPulseText.textContent = `Sẵn sàng (tốn ${TUNING.pulse_cost} đom đóm)`;
  }

  // Contextual lantern deposit prompt
  const nearbyUnlit = sim.lanterns.find(
    (l) => !l.lit && distXZ(sim.player.pos, l.pos) <= TUNING.interact_radius,
  );
  if (nearbyUnlit && sim.state === 'playing') {
    const need = TUNING.lantern_cost - nearbyUnlit.deposited;
    hudPrompt.hidden = false;
    hudPrompt.textContent =
      sim.player.carried > 0
        ? `Nhấn E để nạp ánh sáng vào ${nearbyUnlit.id} (${nearbyUnlit.deposited}/${TUNING.lantern_cost})`
        : `${nearbyUnlit.id} cần thêm ${need} đom đóm để thắp sáng`;
  } else {
    hudPrompt.hidden = true;
  }
}

// Keyboard listeners
window.addEventListener('keydown', (e) => {
  if (helpDialog.open || resultDialog.open) return;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
  if (!e.repeat) {
    if (e.code === 'Space') queuedJump = true;
    if (e.code === 'KeyE' || e.code === 'KeyF') queuedInteract = true;
    if (e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') queuedPulse = true;
  }
  pressedKeys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  pressedKeys.delete(e.code);
});

window.addEventListener('blur', () => {
  pressedKeys.clear();
  isDraggingCamera = false;
});

// Pointer drag to orbit 3D camera
canvasRoot.addEventListener('pointerdown', (e) => {
  isDraggingCamera = true;
  lastPointerX = e.clientX;
  canvasRoot.setPointerCapture(e.pointerId);
});

canvasRoot.addEventListener('pointermove', (e) => {
  if (!isDraggingCamera) return;
  const dx = e.clientX - lastPointerX;
  lastPointerX = e.clientX;
  camYawDeg = (camYawDeg - dx * 0.35) % 360;
});

canvasRoot.addEventListener('pointerup', () => {
  isDraggingCamera = false;
});

// HUD & Dialog controls
btnMute.addEventListener('click', () => {
  const muted = sound.toggleMute();
  btnMute.setAttribute('aria-pressed', String(muted));
  btnMute.textContent = muted ? 'Âm thanh: Tắt' : 'Âm thanh: Bật';
});

btnHelp.addEventListener('click', () => {
  pausedForDialog = true;
  if (!helpDialog.open) helpDialog.showModal();
});

btnRestartHud.addEventListener('click', () => {
  restartGame();
});

helpDialog.addEventListener('close', () => {
  helpDialog.returnValue = '';
  if (sim.state === 'playing') {
    pausedForDialog = false;
  }
});

resultDialog.addEventListener('close', () => {
  const action = resultDialog.returnValue;
  resultDialog.returnValue = '';
  if (action === 'restart') {
    restartGame();
  }
});

window.addEventListener('resize', () => {
  renderer.resize(canvasRoot.clientWidth, canvasRoot.clientHeight);
});

// Show intro dialog on first load
helpDialog.showModal();

// Fixed 60Hz simulation loop decoupled from render FPS
let accumulator = 0;
let lastFrameMs = performance.now();

function loop(nowMs: number): void {
  const frameDt = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  if (!pausedForDialog && sim.state === 'playing') {
    if (pressedKeys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * frameDt) % 360;
    if (pressedKeys.has('KeyL')) camYawDeg = (camYawDeg - 110 * frameDt) % 360;

    accumulator += frameDt;
    while (accumulator >= DT) {
      const events = sim.step(readInput());
      accumulator -= DT;

      for (const ev of events) {
        if (ev.name === 'mote_picked') {
          sound.playPickup(ev.data.carried);
        } else if (ev.name === 'deposit') {
          sound.playDeposit();
        } else if (ev.name === 'lantern_lit') {
          const litCount = sim.lanterns.filter((l) => l.lit).length;
          sound.playLanternLit(litCount);
          showToast(`Đã thắp sáng ${ev.data.lantern_id}! (${litCount}/5)`);
        } else if (ev.name === 'pulse') {
          sound.playPulse();
          renderer.triggerPulseEffect(sim.player.pos);
          const count = ev.data.stunned_ids.length;
          showToast(count > 0 ? `Tỏa sáng làm choáng ${count} Bóng Mực!` : 'Tỏa sáng xua bóng tối!');
        } else if (ev.name === 'player_hit') {
          sound.playHit();
          showToast(`Bóng Mực chạm vào Mây! Còn ${ev.data.flames} ngọn lửa.`);
        } else if (ev.name === 'shade_spawned') {
          showToast('Một Bóng Mực mới vừa xuất hiện trong sương!');
        }
      }

      if (sim.state !== 'playing') {
        accumulator = 0;
        break;
      }
    }
  }

  if (sim.state !== 'playing' && !resultShown) {
    showResultDialog();
  }

  updateHud();
  renderer.sync(sim, camYawDeg, frameDt);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
