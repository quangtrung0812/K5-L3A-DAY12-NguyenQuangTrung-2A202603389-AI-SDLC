import * as THREE from 'three';
import type { LanternIslandSim } from '../sim/engine.js';
import { PALETTE, TUNING } from '../sim/tuning.js';
import type { NightNumber } from '../sim/types.js';

interface LanternVisual {
  group: THREE.Group;
  bulbMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressOrbs: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  inner: THREE.Group;
  phaseOffset: number;
  bodyMat: THREE.MeshStandardMaterial;
  hairMat: THREE.MeshStandardMaterial;
  chaseRing: THREE.Mesh;
  halo: THREE.Mesh;
  spawnRing: THREE.Mesh;
  legs: THREE.Group[];
  ribbonTail: THREE.Group;
}

interface DrifterVisual {
  group: THREE.Group;
  variant: number;
  coreGroup: THREE.Group;
  ribbons: THREE.Object3D[];
  stolenOrbs: THREE.Mesh[];
}

interface MoteVisual {
  group: THREE.Group;
  wingLeft: THREE.Mesh;
  wingRight: THREE.Mesh;
}

interface DustPuff {
  mesh: THREE.Mesh;
  velY: number;
  age: number;
  maxAge: number;
}

interface CharmVisual {
  group: THREE.Group;
  card: THREE.Mesh;
  ring: THREE.Mesh;
}

interface PulseWave {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
}

export class LanternIslandRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private ambientLight: THREE.AmbientLight;
  private moonHemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private mapGroup = new THREE.Group();
  private currentMapNight: NightNumber | null = null;

  private playerGroup: THREE.Group;
  private playerBody: THREE.Group;
  private playerHatFlapLeft: THREE.Group;
  private playerHatFlapRight: THREE.Group;
  private playerSwordGroup: THREE.Group;
  private playerFootLeft: THREE.Group;
  private playerFootRight: THREE.Group;
  private playerCapeFlow: THREE.Group;
  private hangingLantern: THREE.Group;
  private playerLight: THREE.PointLight;
  private invulnShell: THREE.Mesh;
  private dashAura: THREE.Mesh;
  private compassArrow: THREE.Group;

  private lanternVisuals = new Map<string, LanternVisual>();
  private moteVisuals = new Map<string, MoteVisual>();
  private shadeVisuals = new Map<string, ShadeVisual>();
  private drifterVisuals = new Map<string, DrifterVisual>();
  private charmVisuals = new Map<string, CharmVisual>();

  private cloudPuffs: { mesh: THREE.Mesh; angle: number; radius: number; speed: number; y: number }[] = [];
  private windLeaves: THREE.Mesh[] = [];
  private pulseWaves: PulseWave[] = [];
  private dustPuffs: DustPuff[] = [];
  private dustCooldown = 0;
  private runCycle = 0;
  private elapsed = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.fog = new THREE.FogExp2(PALETTE.fog, 0.0085);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      54,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      280,
    );

    // Standardized ambient intensity = 0.15 + 0.55 * (lit / total)
    this.ambientLight = new THREE.AmbientLight('#cfd9ff', 0.15);
    this.scene.add(this.ambientLight);

    // Subtle cool moonlit sky bounce so unlit terrain stays legible while keeping night atmospheric
    this.moonHemiLight = new THREE.HemisphereLight('#7894d8', '#141a38', 0.42);
    this.scene.add(this.moonHemiLight);

    // Cool silver-blue moonlight cast from the full moon direction
    this.moonLight = new THREE.DirectionalLight('#c8dcff', 1.35);
    this.moonLight.position.set(45, 58, -60);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 180;
    const d = 62;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.scene.add(this.mapGroup);
    this.buildSkyAndSeaOfClouds();
    this.buildWindLeaves();

    const rig = this.buildPlayerMay();
    this.playerGroup = rig.group;
    this.playerBody = rig.body;
    this.playerHatFlapLeft = rig.hatFlapLeft;
    this.playerHatFlapRight = rig.hatFlapRight;
    this.playerSwordGroup = rig.swordGroup;
    this.playerFootLeft = rig.footLeft;
    this.playerFootRight = rig.footRight;
    this.playerCapeFlow = rig.capeFlow;
    this.hangingLantern = rig.hangingLantern;
    this.playerLight = rig.light;
    this.invulnShell = rig.invulnShell;
    this.dashAura = rig.dashAura;
    this.compassArrow = rig.compassArrow;
    this.scene.add(this.playerGroup);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  resetForNight(night: NightNumber): void {
    for (const vis of this.lanternVisuals.values()) this.scene.remove(vis.group);
    this.lanternVisuals.clear();
    for (const vis of this.moteVisuals.values()) this.scene.remove(vis.group);
    this.moteVisuals.clear();
    for (const vis of this.shadeVisuals.values()) this.scene.remove(vis.group);
    this.shadeVisuals.clear();
    for (const vis of this.drifterVisuals.values()) this.scene.remove(vis.group);
    this.drifterVisuals.clear();
    for (const vis of this.charmVisuals.values()) this.scene.remove(vis.group);
    this.charmVisuals.clear();

    if (this.currentMapNight !== night) {
      this.rebuildMapGeometry(night);
      this.currentMapNight = night;
    }
  }

  triggerPulseEffect(pos: [number, number, number]): void {
    const geom = new THREE.RingGeometry(0.35, 0.75, 48);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos[0], pos[1] + 0.8, pos[2]);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, age: 0, maxAge: 0.42 });
  }

  /** Projects nearest unlit lantern for off-screen HUD indicator arrow. */
  getOffscreenLanternIndicator(
    sim: LanternIslandSim,
    viewportW: number,
    viewportH: number,
  ): { visible: boolean; x: number; y: number; angleDeg: number; label: string } {
    let nearest: { id: string; pos: [number, number, number]; dist: number } | null = null;
    for (const l of sim.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(l.pos[0] - sim.player.pos[0], l.pos[2] - sim.player.pos[2]);
      if (!nearest || d < nearest.dist) {
        nearest = { id: l.id, pos: l.pos, dist: d };
      }
    }
    if (!nearest) return { visible: false, x: 0, y: 0, angleDeg: 0, label: '' };

    const worldPos = new THREE.Vector3(nearest.pos[0], nearest.pos[1] + 3.6, nearest.pos[2]);
    const ndc = worldPos.clone().project(this.camera);

    const onScreen =
      ndc.z < 1 && ndc.x >= -0.92 && ndc.x <= 0.92 && ndc.y >= -0.88 && ndc.y <= 0.88;
    if (onScreen) {
      return { visible: false, x: 0, y: 0, angleDeg: 0, label: '' };
    }

    let dx = ndc.x;
    let dy = -ndc.y; // screen Y downwards
    if (ndc.z > 1) {
      dx = -dx;
      dy = -dy;
    }
    const angleRad = Math.atan2(dy, dx);
    const padX = viewportW * 0.44;
    const padY = viewportH * 0.4;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const scale = Math.min(
      Math.abs(cosA) > 1e-4 ? padX / Math.abs(cosA) : Infinity,
      Math.abs(sinA) > 1e-4 ? padY / Math.abs(sinA) : Infinity,
    );
    const x = viewportW / 2 + cosA * scale;
    const y = viewportH / 2 + sinA * scale;

    return {
      visible: true,
      x,
      y,
      angleDeg: (angleRad * 180) / Math.PI + 90,
      label: `${nearest.id} · ${Math.round(nearest.dist)}m`,
    };
  }

  sync(
    sim: LanternIslandSim,
    camYawDeg: number,
    camPitchDeg: number,
    camDist: number,
    dt: number,
  ): void {
    if (this.currentMapNight !== sim.night) {
      this.resetForNight(sim.night);
    }

    this.elapsed += dt;

    // 1. Standardized ambient intensity: 0.15 + 0.55 * (lit / total)
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = litCount / Math.max(1, sim.lanterns.length);
    this.ambientLight.intensity = 0.15 + 0.55 * progress;
    this.fog.density = 0.0085 - progress * 0.0032;

    // 2. Player Mây (Chibi Scarlet — White Mecha-Kasa Samurai Lantern-Keeper animation)
    const visiblePlayer = sim.player.fallRespawnTicks === 0;
    const horizSpeed = Math.hypot(sim.player.vel[0], sim.player.vel[2]);
    const isMoving = horizSpeed > 0.35;
    const isDashing = sim.player.dashActiveTicks > 0;
    if (isMoving && sim.player.grounded) {
      this.runCycle += dt * (horizSpeed * 2.4);
    }

    this.playerGroup.visible = visiblePlayer;
    this.playerGroup.position.set(sim.player.pos[0], sim.player.pos[1], sim.player.pos[2]);
    this.playerBody.rotation.y = sim.player.yawRad;

    // Gentle chibi hop bob & forward momentum lean
    const hopBob =
      isMoving && sim.player.grounded
        ? Math.abs(Math.sin(this.runCycle)) * 0.12
        : Math.sin(this.elapsed * 2.6) * 0.025;
    this.playerBody.position.y = hopBob;
    const targetLean = isDashing ? 0.3 : isMoving ? 0.12 : 0;
    this.playerBody.rotation.x += (targetLean - this.playerBody.rotation.x) * Math.min(1, dt * 14);

    // Swaying kasa hat armored side plates & billowing haori coat / long lavender hair
    const flapBack = isDashing ? 0.45 : isMoving ? 0.2 : 0;
    const flapSway = Math.sin(this.elapsed * 4.5) * 0.08;
    this.playerHatFlapLeft.rotation.x = flapBack + flapSway;
    this.playerHatFlapRight.rotation.x = flapBack - flapSway;
    this.playerCapeFlow.rotation.x = isDashing
      ? 0.48
      : isMoving
        ? 0.22 + Math.sin(this.runCycle) * 0.09
        : 0.04 + Math.sin(this.elapsed * 2.4) * 0.03;

    // Pattering chibi armored boots & dynamic sword guard sway
    const stride = isMoving && sim.player.grounded ? Math.sin(this.runCycle) : 0;
    this.playerFootLeft.position.z = stride * 0.16;
    this.playerFootRight.position.z = -stride * 0.16;
    this.playerFootLeft.position.y = Math.max(0, stride) * 0.07;
    this.playerFootRight.position.y = Math.max(0, -stride) * 0.07;
    this.playerSwordGroup.position.y = 0.98 + Math.sin(this.elapsed * 3.2) * 0.015;
    this.playerSwordGroup.rotation.z = isDashing
      ? 0.18
      : isMoving
        ? Math.sin(this.runCycle) * 0.05
        : 0;

    // Dust puffs behind feet when running or dashing (client-only speed juice)
    this.dustCooldown -= dt;
    if (visiblePlayer && (isDashing || (isMoving && sim.player.grounded)) && this.dustCooldown <= 0) {
      this.dustCooldown = isDashing ? 0.035 : 0.12;
      this.spawnDustPuff(sim.player.pos, isDashing || sim.player.charmTicks > 0);
    }

    this.hangingLantern.rotation.z = Math.sin(this.elapsed * 4.5) * 0.16;
    this.hangingLantern.rotation.x = isDashing ? -0.48 : isMoving ? -0.22 : 0;
    this.playerLight.intensity = 2.6 + sim.player.carried * 0.28;
    this.invulnShell.visible = sim.player.invulnTicks > 0 && Math.floor(this.elapsed * 16) % 2 === 0;
    this.dashAura.visible = isDashing || sim.player.charmTicks > 0;
    if (this.dashAura.visible) {
      this.dashAura.rotation.y = this.elapsed * 9;
    }

    // Dynamic camera FOV boost while running/dashing for snappier speed feel (no sim speed change)
    const targetFov = isDashing ? 67 : sim.player.charmTicks > 0 && isMoving ? 63 : isMoving ? 59 : 54;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
    }

    // Client-only Firefly Compass pointing toward nearest unlit lantern
    let nearestUnlit: [number, number, number] | null = null;
    let bestD = Infinity;
    for (const l of sim.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(l.pos[0] - sim.player.pos[0], l.pos[2] - sim.player.pos[2]);
      if (d < bestD) {
        bestD = d;
        nearestUnlit = l.pos;
      }
    }
    if (nearestUnlit && visiblePlayer) {
      this.compassArrow.visible = true;
      this.compassArrow.rotation.y = Math.atan2(
        nearestUnlit[0] - sim.player.pos[0],
        nearestUnlit[2] - sim.player.pos[2],
      );
    } else {
      this.compassArrow.visible = false;
    }

    // 3. Third-person camera following Mây along cam_yaw_deg, cam_pitch_deg & mouse-wheel zoom camDist
    const theta = (camYawDeg * Math.PI) / 180;
    const clampedDist = Math.max(2.6, Math.min(24.0, camDist));
    const minPitch = clampedDist < 7 ? 4 : 16;
    const pitchRad = (Math.max(minPitch, Math.min(56, camPitchDeg)) * Math.PI) / 180;
    const horizDist = Math.cos(pitchRad) * clampedDist;
    const focusY = clampedDist < 7 ? 1.15 : 1.4;
    const camHeight = Math.sin(pitchRad) * clampedDist + focusY;
    const lookX = sim.player.fallRespawnTicks > 0 ? sim.map.playerSpawn[0] : sim.player.pos[0];
    const lookY = sim.player.fallRespawnTicks > 0 ? sim.map.playerSpawn[1] : Math.max(-4, sim.player.pos[1]);
    const lookZ = sim.player.fallRespawnTicks > 0 ? sim.map.playerSpawn[2] : sim.player.pos[2];
    const targetCamPos = new THREE.Vector3(
      lookX - Math.sin(theta) * horizDist,
      lookY + camHeight,
      lookZ - Math.cos(theta) * horizDist,
    );
    this.camera.position.lerp(targetCamPos, Math.min(1, dt * 15));
    this.camera.lookAt(lookX, lookY + focusY, lookZ);

    // 4. Lanterns
    for (const lantern of sim.lanterns) {
      let vis = this.lanternVisuals.get(lantern.id);
      if (!vis) {
        vis = this.createLanternVisual();
        this.lanternVisuals.set(lantern.id, vis);
        this.scene.add(vis.group);
      }
      vis.group.position.set(lantern.pos[0], lantern.pos[1], lantern.pos[2]);

      const ratio = lantern.lit ? 1 : lantern.deposited / Math.max(1, TUNING.lantern_cost);
      if (lantern.lit) {
        const pulse = 0.92 + Math.sin(this.elapsed * 3.5 + lantern.pos[0]) * 0.08;
        vis.bulbMat.color.set(PALETTE.lanternCore);
        vis.bulbMat.emissive.set(PALETTE.lanternLit);
        vis.bulbMat.emissiveIntensity = 2.6 * pulse;
        vis.light.intensity = 20 * pulse;
        vis.safeRing.visible = true;
      } else {
        vis.bulbMat.color
          .set(PALETTE.lanternUnlit)
          .lerp(new THREE.Color(PALETTE.lanternLit), ratio * 0.65);
        vis.bulbMat.emissive.set(PALETTE.lanternLit);
        vis.bulbMat.emissiveIntensity = ratio * 1.1;
        vis.light.intensity = ratio * 5.0;
        vis.safeRing.visible = false;
      }

      const activeOrbs = Math.ceil((lantern.lit ? 10 : lantern.deposited) / 2);
      vis.progressOrbs.forEach((orb, idx) => {
        orb.visible = idx < activeOrbs;
        orb.position.y = 1.65 + Math.sin(this.elapsed * 3 + idx) * 0.09;
      });
    }

    // 5. Motes (Fireflies with fluttering wings)
    const activeMoteIds = new Set<string>();
    for (const mote of sim.motes) {
      activeMoteIds.add(mote.id);
      let vis = this.moteVisuals.get(mote.id);
      if (!vis) {
        vis = this.createMoteVisual();
        this.moteVisuals.set(mote.id, vis);
        this.scene.add(vis.group);
      }
      const bob =
        mote.pos[1] + 0.8 + Math.sin(this.elapsed * 4.0 + mote.pos[0] * 0.7 + mote.pos[2] * 0.5) * 0.22;
      vis.group.position.set(mote.pos[0], bob, mote.pos[2]);
      vis.group.rotation.y = this.elapsed * 1.8;
      const flap = Math.sin(this.elapsed * 22 + mote.pos[0]) * 0.55;
      vis.wingLeft.rotation.z = 0.25 + flap;
      vis.wingRight.rotation.z = -0.25 - flap;
      vis.group.visible =
        mote.ttlTicks === null || mote.ttlTicks > 120 || Math.floor(this.elapsed * 14) % 2 === 0;
    }
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis.group);
        this.moteVisuals.delete(id);
      }
    }

    // 6. Shades (Doro chibi quadruped across all 5 standardized Contract v1.1 states)
    const activeShadeIds = new Set<string>();
    for (const shade of sim.shades) {
      activeShadeIds.add(shade.id);
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) {
        vis = this.createShadeVisual(shade.id);
        this.shadeVisuals.set(shade.id, vis);
        this.scene.add(vis.group);
      }

      const isSpawning = shade.state === 'spawning';
      const isStunned = shade.state === 'stunned';
      const isChase = shade.state === 'chase';
      const isRecoil = shade.state === 'recoil';

      const trotRate = isChase ? 16 : isStunned ? 2.5 : 9;
      const trotPhase = this.elapsed * trotRate + vis.phaseOffset;
      const hopY = isSpawning || isStunned ? 0 : Math.abs(Math.sin(trotPhase)) * (isChase ? 0.16 : 0.08);
      const groundY = shade.pos[1];

      vis.group.position.set(shade.pos[0], groundY, shade.pos[2]);
      vis.group.lookAt(sim.player.pos[0], groundY, sim.player.pos[2]);

      const spawningScale = isSpawning ? 0.42 + Math.sin(this.elapsed * 18) * 0.14 : 1;
      vis.inner.scale.setScalar(spawningScale);
      vis.inner.position.y = hopY;

      vis.spawnRing.visible = isSpawning;
      if (isSpawning) {
        vis.spawnRing.rotation.z = this.elapsed * 6;
      }

      vis.chaseRing.visible = isChase;
      if (isChase) {
        const pulse = 1 + Math.sin(this.elapsed * 12) * 0.1;
        vis.chaseRing.scale.setScalar(pulse);
        vis.chaseRing.rotation.z = -this.elapsed * 4;
      }

      // Expressive Doro state posture
      vis.inner.rotation.x = isChase ? 0.14 : isRecoil ? -0.3 : 0;
      vis.inner.rotation.z = isStunned
        ? Math.sin(this.elapsed * 10) * 0.28
        : isChase
          ? Math.sin(trotPhase) * 0.08
          : 0;

      // Subtle tint feedback while preserving unmistakable white body + pink hair Doro look
      vis.bodyMat.color.set(isStunned ? '#dcd5f2' : '#fcfbfd');
      vis.bodyMat.emissive.set(isChase ? PALETTE.shadeEdge : isStunned ? PALETTE.shadeStunned : '#2b1c36');
      vis.bodyMat.emissiveIntensity = isChase ? 0.24 : isStunned ? 0.35 : 0.08;
      vis.hairMat.color.set(isStunned ? '#cfa8dc' : '#f9a5c4');
      vis.hairMat.emissive.set(isChase ? '#d84f80' : '#4a1c36');
      vis.hairMat.emissiveIntensity = isChase ? 0.28 : 0.1;

      vis.halo.visible = isStunned;
      if (isStunned) vis.halo.rotation.z = this.elapsed * 6;

      // Scampering 4 stubby legs (diagonal trot gait) & fluttering white ribbon behind rose bun
      const legAmp = isSpawning || isStunned ? 0.08 : isChase ? 0.72 : 0.42;
      const swing = Math.sin(trotPhase) * legAmp;
      if (vis.legs[0]) vis.legs[0].rotation.x = swing; // front-left
      if (vis.legs[1]) vis.legs[1].rotation.x = -swing; // front-right
      if (vis.legs[2]) vis.legs[2].rotation.x = -swing; // back-left
      if (vis.legs[3]) vis.legs[3].rotation.x = swing; // back-right
      vis.ribbonTail.rotation.y = Math.sin(this.elapsed * (isChase ? 14 : 6) + vis.phaseOffset) * 0.22;
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 7. Drifters (2 diverse high-detail silk spirit variants)
    const activeDrifterIds = new Set<string>();
    for (const drifter of sim.drifters) {
      if (drifter.state === 'removed') continue;
      activeDrifterIds.add(drifter.id);
      let vis = this.drifterVisuals.get(drifter.id);
      if (!vis) {
        vis = this.createDrifterVisual(drifter.id);
        this.drifterVisuals.set(drifter.id, vis);
        this.scene.add(vis.group);
      }
      const y = drifter.pos[1] + 1.45 + Math.sin(this.elapsed * 6 + drifter.pos[0]) * 0.24;
      vis.group.position.set(drifter.pos[0], y, drifter.pos[2]);
      vis.group.lookAt(sim.player.pos[0], y, sim.player.pos[2]);
      vis.coreGroup.rotation.z = Math.sin(this.elapsed * 5 + vis.variant) * 0.2;
      vis.ribbons.forEach((rib, idx) => {
        rib.rotation.x = Math.sin(this.elapsed * 9 + idx * 1.3) * 0.35;
        rib.rotation.y = Math.cos(this.elapsed * 7 + idx * 1.1) * 0.25;
      });
      vis.stolenOrbs.forEach((orb, idx) => {
        orb.visible = idx < drifter.stolen;
        const a = this.elapsed * 4.5 + (idx * Math.PI * 2) / 3;
        orb.position.set(Math.cos(a) * 0.9, 0.25, Math.sin(a) * 0.9);
      });
    }
    for (const [id, vis] of this.drifterVisuals.entries()) {
      if (!activeDrifterIds.has(id)) {
        this.scene.remove(vis.group);
        this.drifterVisuals.delete(id);
      }
    }

    // 8. Charms (Bùa Gió)
    const activeCharmIds = new Set<string>();
    for (const charm of sim.charms) {
      activeCharmIds.add(charm.id);
      let vis = this.charmVisuals.get(charm.id);
      if (!vis) {
        vis = this.createCharmVisual();
        this.charmVisuals.set(charm.id, vis);
        this.scene.add(vis.group);
      }
      vis.group.position.set(charm.pos[0], charm.pos[1], charm.pos[2]);
      vis.card.visible = charm.available;
      vis.ring.visible = true;
      if (charm.available) {
        vis.card.position.y = 1.15 + Math.sin(this.elapsed * 3.4) * 0.16;
        vis.card.rotation.y = this.elapsed * 2.1;
      }
    }
    for (const [id, vis] of this.charmVisuals.entries()) {
      if (!activeCharmIds.has(id)) {
        this.scene.remove(vis.group);
        this.charmVisuals.delete(id);
      }
    }

    // 9. Wind leaves visual on Night 3 (warning or active)
    const showLeaves = sim.wind.warning || sim.wind.active;
    const windRad = (sim.wind.dirDeg * Math.PI) / 180;
    const leafSpeed = sim.wind.active ? 18 : 7;
    for (let i = 0; i < this.windLeaves.length; i++) {
      const leaf = this.windLeaves[i];
      leaf.visible = showLeaves;
      if (showLeaves) {
        leaf.position.x += Math.cos(windRad) * leafSpeed * dt;
        leaf.position.z += Math.sin(windRad) * leafSpeed * dt;
        leaf.rotation.x += 5 * dt;
        leaf.rotation.y += 4 * dt;
        if (Math.hypot(leaf.position.x - sim.player.pos[0], leaf.position.z - sim.player.pos[2]) > 35) {
          const spread = (i - this.windLeaves.length / 2) * 1.4;
          leaf.position.set(
            sim.player.pos[0] - Math.cos(windRad) * 26 - Math.sin(windRad) * spread,
            sim.player.pos[1] + 1.2 + (i % 5) * 1.1,
            sim.player.pos[2] - Math.sin(windRad) * 26 + Math.cos(windRad) * spread,
          );
        }
      }
    }

    // 10. Clouds & pulse waves
    for (const c of this.cloudPuffs) {
      c.angle += c.speed * dt;
      c.mesh.position.set(Math.cos(c.angle) * c.radius, c.y, Math.sin(c.angle) * c.radius);
    }

    for (let i = this.pulseWaves.length - 1; i >= 0; i--) {
      const wave = this.pulseWaves[i];
      wave.age += dt;
      const t = wave.age / wave.maxAge;
      if (t >= 1) {
        this.scene.remove(wave.mesh);
        wave.mesh.geometry.dispose();
        (wave.mesh.material as THREE.Material).dispose();
        this.pulseWaves.splice(i, 1);
      } else {
        const scale = 1 + t * (TUNING.pulse_radius * 1.18);
        wave.mesh.scale.set(scale, 1, scale);
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      }
    }

    // Footstep & dash dust puffs
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const p = this.dustPuffs[i];
      p.age += dt;
      const t = p.age / p.maxAge;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.dustPuffs.splice(i, 1);
      } else {
        p.mesh.position.y += p.velY * dt;
        p.mesh.scale.setScalar(1 + t * 1.4);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.55;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private spawnDustPuff(pos: [number, number, number], gold: boolean): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 6, 6),
      new THREE.MeshBasicMaterial({
        color: gold ? PALETTE.goldAccent : PALETTE.mayCloak,
        transparent: true,
        opacity: 0.55,
      }),
    );
    mesh.position.set(pos[0], pos[1] + 0.16, pos[2]);
    this.scene.add(mesh);
    this.dustPuffs.push({ mesh, velY: 0.65, age: 0, maxAge: 0.34 });
  }

  private hashVariant(id: string, mod: number): number {
    const match = /(\d+)$/.exec(id);
    if (match) return (Number.parseInt(match[1], 10) - 1) % mod;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % mod;
  }

  private buildSkyAndSeaOfClouds(): void {
    const starPositions: number[] = [];
    for (let i = 0; i < 320; i++) {
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = 0.22 + ((i * 29) % 100) / 140;
      const r = 155;
      starPositions.push(
        r * Math.cos(phi) * Math.cos(theta),
        r * Math.sin(phi) + 12,
        r * Math.cos(phi) * Math.sin(theta),
      );
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: PALETTE.moteCore,
      size: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    this.scene.add(new THREE.Points(starGeom, starMat));

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#eef4ff' }),
    );
    moon.position.set(60, 72, -85);
    this.scene.add(moon);

    const moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(11.5, 20, 20),
      new THREE.MeshBasicMaterial({
        color: '#9dbdff',
        transparent: true,
        opacity: 0.22,
      }),
    );
    moonHalo.position.copy(moon.position);
    this.scene.add(moonHalo);

    // Sea of clouds floor below islands (#12384A)
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 0.95 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -11.5;
    this.scene.add(sea);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.cloudSea,
      roughness: 0.9,
      transparent: true,
      opacity: 0.82,
    });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const radius = 58 + (i % 4) * 10;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + (i % 3) * 2.4, 1), cloudMat);
      puff.scale.set(1.5, 0.5, 1.2);
      const y = -5.5 - (i % 3) * 1.4;
      puff.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      this.scene.add(puff);
      this.cloudPuffs.push({ mesh: puff, angle, radius, speed: 0.01 + (i % 3) * 0.004, y });
    }
  }

  private buildWindLeaves(): void {
    const geom = new THREE.PlaneGeometry(0.45, 0.22);
    const mat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldAccent,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 28; i++) {
      const leaf = new THREE.Mesh(geom, mat);
      leaf.visible = false;
      this.scene.add(leaf);
      this.windLeaves.push(leaf);
    }
  }

  private rebuildMapGeometry(night: NightNumber): void {
    while (this.mapGroup.children.length > 0) {
      this.mapGroup.remove(this.mapGroup.children[0]);
    }

    const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.92 });
    const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
    const padMat = new THREE.MeshStandardMaterial({
      color: PALETTE.goldAccent,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.85,
      roughness: 0.4,
    });

    const addIslandDisk = (cx: number, cz: number, radius: number, topY: number, height: number) => {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.92, height, 48),
        grassMat,
      );
      body.position.set(cx, topY - height / 2, cz);
      body.receiveShadow = true;
      this.mapGroup.add(body);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(radius - 0.35, 0.32, 8, 56),
        sandMat,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(cx, topY + 0.02, cz);
      this.mapGroup.add(rim);
    };

    const addLaunchpad = (x: number, y: number, z: number) => {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.24, 20), padMat);
      pad.position.set(x, y + 0.12, z);
      this.mapGroup.add(pad);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.07, 8, 24),
        new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.32, z);
      this.mapGroup.add(ring);
    };

    if (night === 1) {
      addIslandDisk(0, 0, 40, 0, 4.5);
      // Central sandy circle & harbor pier
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.12, 24), sandMat);
      plaza.position.y = 0.02;
      plaza.receiveShadow = true;
      this.mapGroup.add(plaza);

      for (let i = 0; i < 5; i++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.95), woodMat);
        plank.position.set(0, 0.04, 38.5 + i * 1.15);
        this.mapGroup.add(plank);
      }
    } else if (night === 2) {
      addIslandDisk(0, 0, 28, 0, 4.5);
      addIslandDisk(70, 0, 28, 0, 4.5);

      // Bamboo bridge x in [26, 44], z in [-2, 2], no railings
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 4), woodMat);
      bridge.position.set(35, -0.175, 0);
      bridge.receiveShadow = true;
      this.mapGroup.add(bridge);

      for (let x = 26.8; x <= 43.4; x += 1.4) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 4.05), sandMat);
        slat.position.set(x, 0.02, 0);
        this.mapGroup.add(slat);
      }

      addLaunchpad(20, 0, 18);
      addLaunchpad(50, 0, -18);
    } else {
      // Night 3: Đảo Chuông — 3 tiers + 2 ramps + launchpad + 8m Bell Tower
      addIslandDisk(0, 0, 45, 0, 4.5);

      // Tier 1 (Y=3): half-annulus r in [12, 24], z > 0 (angles 0..pi)
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.lineTo(-12, 0);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      shape.closePath();
      const tier1Geom = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
      // Rotate shape XY into XZ with +Y = +Z? Wait: rotateX(PI/2) maps (x, y, z) -> (x, -z, y)!
      // Let's check: with rotateX(PI/2), shape y>0 maps to +Z (exact match for z>0!), and extrude depth along +z maps to -Y (so placing at y=3 extrudes downward from y=3 to y=0!).
      tier1Geom.rotateX(Math.PI / 2);
      const tier1Mesh = new THREE.Mesh(tier1Geom, grassMat);
      tier1Mesh.position.y = 3;
      tier1Mesh.receiveShadow = true;
      tier1Mesh.castShadow = true;
      this.mapGroup.add(tier1Mesh);

      // Tier 2 (Y=6): disk radius 8 at center
      addIslandDisk(0, 0, 8, 6, 6);

      // 2 Straight wooden ramps: 3m wide at 30° & 150°, foot r=30 (Y=0) to top r=24 (Y=3)
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const rampLen = Math.hypot(6, 3);
        const slope = Math.atan2(3, 6);
        const rampGroup = new THREE.Group();
        const midR = 27;
        rampGroup.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
        // Orient local +Z along inward radial vector (-cos(rad), -sin(rad))
        rampGroup.rotation.y = Math.atan2(-Math.cos(rad), -Math.sin(rad));
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, rampLen + 0.4), woodMat);
        deck.rotation.x = -slope;
        deck.receiveShadow = true;
        deck.castShadow = true;
        rampGroup.add(deck);
        this.mapGroup.add(rampGroup);
      }

      // Tier 1 -> Tier 2 Launchpad at (0, 3, 13)
      addLaunchpad(0, 3, 13);

      // 8m Bell Tower cylinder r=2m at center of Tier 2 (Y=6..14)
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 8.0, 20), woodMat);
      tower.position.set(0, 10, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.mapGroup.add(tower);

      const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.4, 8), sandMat);
      towerRoof.position.set(0, 15.2, 0);
      this.mapGroup.add(towerRoof);

      const bell = new THREE.Mesh(
        new THREE.ConeGeometry(0.75, 1.2, 12),
        new THREE.MeshStandardMaterial({
          color: PALETTE.goldAccent,
          metalness: 0.6,
          roughness: 0.3,
        }),
      );
      bell.position.set(0, 12.8, 0);
      this.mapGroup.add(bell);
    }
  }

  private createScarletHatTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Crisp pearl-white mecha-kasa hat base
      ctx.fillStyle = '#f3f1ed';
      ctx.fillRect(0, 0, 512, 256);

      // Subtle sci-fi mechanical armor panel seam lines
      ctx.strokeStyle = '#9b9aa6';
      ctx.lineWidth = 2;
      for (let x = 0; x < 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, 178);
      ctx.lineTo(512, 178);
      ctx.stroke();

      // Bold crimson red accent trim lines around brim & vertical panel cutouts
      ctx.strokeStyle = '#c8102e';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 224);
      ctx.lineTo(512, 224);
      ctx.stroke();

      ctx.lineWidth = 5;
      for (const px of [48, 176, 304, 432]) {
        ctx.beginPath();
        ctx.moveTo(px, 224);
        ctx.lineTo(px + 28, 168);
        ctx.lineTo(px + 28, 118);
        ctx.stroke();
      }

      // Tiny metallic panel rivets
      ctx.fillStyle = '#6c6c78';
      for (let x = 16; x < 512; x += 64) {
        ctx.beginPath();
        ctx.arc(x, 206, 3, 0, Math.PI * 2);
        ctx.arc(x + 32, 192, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private buildPlayerMay(): {
    group: THREE.Group;
    body: THREE.Group;
    hatFlapLeft: THREE.Group;
    hatFlapRight: THREE.Group;
    swordGroup: THREE.Group;
    footLeft: THREE.Group;
    footRight: THREE.Group;
    capeFlow: THREE.Group;
    hangingLantern: THREE.Group;
    light: THREE.PointLight;
    invulnShell: THREE.Mesh;
    dashAura: THREE.Mesh;
    compassArrow: THREE.Group;
  } {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);

    // Chibi Scarlet (White Mecha-Kasa Samurai) materials harmonized with Đảo Đèn Lồng palette
    const skinMat = new THREE.MeshStandardMaterial({ color: '#fce8dc', roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#a896ad', roughness: 0.58 });
    const hairDarkMat = new THREE.MeshStandardMaterial({ color: '#7d6b83', roughness: 0.65 });
    const whiteCoatMat = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.58 });
    const crimsonMat = new THREE.MeshStandardMaterial({
      color: PALETTE.mayScarfAndCharm,
      roughness: 0.48,
      side: THREE.DoubleSide,
    });
    const crimsonDarkMat = new THREE.MeshStandardMaterial({ color: '#8f1227', roughness: 0.52 });
    const armorDarkMat = new THREE.MeshStandardMaterial({
      color: '#252630',
      roughness: 0.42,
      metalness: 0.35,
    });
    const ribbonBlackMat = new THREE.MeshStandardMaterial({
      color: '#1e1f28',
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const whiteMetalMat = new THREE.MeshStandardMaterial({
      color: '#eceef2',
      roughness: 0.32,
      metalness: 0.25,
    });
    const bladeSilverMat = new THREE.MeshStandardMaterial({
      color: '#b5becd',
      metalness: 0.78,
      roughness: 0.22,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.goldAccent,
      metalness: 0.72,
      roughness: 0.25,
    });

    // 1. Dark armored samurai boots / tabi sandals with white socks
    const makeFoot = (sx: number): THREE.Group => {
      const f = new THREE.Group();
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.068, 0.24, 10), whiteCoatMat);
      sock.position.set(sx, 0.15, 0);
      f.add(sock);
      const shinPlate = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 0.06), armorDarkMat);
      shinPlate.position.set(sx, 0.22, 0.07);
      f.add(shinPlate);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 10), armorDarkMat);
      shoe.scale.set(0.95, 0.65, 1.42);
      shoe.position.set(sx, 0.06, 0.04);
      shoe.castShadow = true;
      f.add(shoe);
      body.add(f);
      return f;
    };
    const footLeft = makeFoot(0.14);
    const footRight = makeFoot(-0.14);

    // 2. Samurai Hakama Under-Skirt + White Haori Kimono Coat + Crimson Lining + Braided Red Obi Rope
    const hakama = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.74, 16), armorDarkMat);
    hakama.position.y = 0.52;
    hakama.castShadow = true;
    body.add(hakama);

    // White draped front haori panels with bold crimson border stripes & calligraphy bar accents
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.64, 0.05), whiteCoatMat);
      panel.position.set(sx * 0.16, 0.54, 0.25);
      panel.rotation.y = sx * 0.28;
      panel.rotation.x = -0.14;
      panel.castShadow = true;
      body.add(panel);

      const redTrim = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.65, 0.056), crimsonMat);
      redTrim.position.set(sx * 0.06, 0.54, 0.28);
      redTrim.rotation.y = sx * 0.28;
      redTrim.rotation.x = -0.14;
      body.add(redTrim);

      // Sleek dark lower armor side tasset with crimson accent stripe
      const tasset = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 0.04), armorDarkMat);
      tasset.position.set(sx * 0.34, 0.44, 0.1);
      tasset.rotation.y = sx * 1.1;
      tasset.rotation.z = sx * -0.18;
      body.add(tasset);
    }

    // Stylized red brushstroke crest bars on left front white kimono panel (+X)
    for (let i = 0; i < 3; i++) {
      const stroke = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.015), crimsonMat);
      stroke.position.set(0.16, 0.58 - i * 0.09, 0.285 + i * 0.014);
      stroke.rotation.y = 0.28;
      stroke.rotation.z = i === 1 ? -0.25 : 0.12;
      body.add(stroke);
    }

    // Upper white kimono bodice with dark collar crossover & crimson inner trim
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 14), whiteCoatMat);
    bodice.position.y = 0.92;
    bodice.castShadow = true;
    body.add(bodice);

    const neckCollar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), armorDarkMat);
    neckCollar.rotation.x = Math.PI / 2;
    neckCollar.position.y = 1.07;
    body.add(neckCollar);

    // Signature Thick Braided Crimson Obi Rope (Shimenawa waist knot) + 2 White-Tipped Tassels on front-right (-X)
    const obiBand = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.048, 8, 22), crimsonDarkMat);
    obiBand.rotation.x = Math.PI / 2;
    obiBand.position.y = 0.78;
    body.add(obiBand);

    const ropeKnot = new THREE.Group();
    ropeKnot.position.set(-0.18, 0.75, 0.26);
    for (const rAngle of [-0.45, 0.45]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.042, 8, 14), crimsonMat);
      loop.rotation.y = rAngle;
      loop.position.x = rAngle * 0.14;
      ropeKnot.add(loop);
    }
    for (let i = 0; i < 2; i++) {
      const tailGroup = new THREE.Group();
      tailGroup.position.set(i === 0 ? -0.07 : 0.05, -0.05, 0.04);
      tailGroup.rotation.z = i === 0 ? -0.35 : -0.1;
      const cord = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.18, 6, 8), crimsonMat);
      cord.position.y = -0.1;
      tailGroup.add(cord);
      const whiteTip = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), whiteCoatMat);
      whiteTip.scale.set(1.0, 1.25, 1.0);
      whiteTip.position.y = -0.23;
      tailGroup.add(whiteTip);
      ropeKnot.add(tailGroup);
    }
    body.add(ropeKnot);

    // Billowing Back Haori Coat (White outer + vivid Crimson inner lining) + Long Lavender Back Hair + Black Sashes
    const capeFlow = new THREE.Group();
    capeFlow.position.set(0, 1.04, -0.16);
    body.add(capeFlow);

    // Crimson-lined flowing back haori cloak flaring outward
    const cloakOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.62, 0.74, 14, 1, true, Math.PI * 0.52, Math.PI * 0.96),
      whiteCoatMat,
    );
    cloakOuter.position.set(0, -0.4, -0.05);
    cloakOuter.castShadow = true;
    capeFlow.add(cloakOuter);

    const cloakLining = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.59, 0.72, 14, 1, true, Math.PI * 0.52, Math.PI * 0.96),
      crimsonMat,
    );
    cloakLining.position.set(0, -0.4, -0.03);
    capeFlow.add(cloakLining);

    // Sweeping flared crimson-underlit side tail wings peeking from behind shoulders (signature Scarlet silhouette!)
    for (const sx of [-1, 1]) {
      const hairWave = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.76, 8), hairMat);
      hairWave.scale.set(1.0, 1.0, 0.42);
      hairWave.rotation.x = Math.PI + 0.18;
      hairWave.rotation.z = sx * -0.48;
      hairWave.position.set(sx * 0.34, -0.22, -0.12);
      hairWave.castShadow = true;
      capeFlow.add(hairWave);

      const crimsonFlare = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.66, 8), crimsonMat);
      crimsonFlare.scale.set(1.0, 1.0, 0.32);
      crimsonFlare.rotation.x = Math.PI + 0.24;
      crimsonFlare.rotation.z = sx * -0.56;
      crimsonFlare.position.set(sx * 0.38, -0.42, -0.08);
      capeFlow.add(crimsonFlare);
    }

    // Center cascading lavender-silver long hair veil down her back
    const backHairMain = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.82, 10), hairMat);
    backHairMain.scale.set(1.08, 1.0, 0.42);
    backHairMain.rotation.x = Math.PI + 0.14;
    backHairMain.position.set(0, -0.22, -0.16);
    backHairMain.castShadow = true;
    capeFlow.add(backHairMain);

    // Twin trailing black samurai sash ribbons fluttering off left back (+X)
    for (let i = 0; i < 2; i++) {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.025), ribbonBlackMat);
      sash.position.set(0.42 + i * 0.12, -0.28 - i * 0.14, -0.08);
      sash.rotation.z = -0.82 - i * 0.18;
      capeFlow.add(sash);
    }

    // 3. Left Arm (+X, viewer's right in front view): Tiered Crimson/Black Samurai Sode Shoulder Armor + Gauntlet
    const leftArm = new THREE.Group();
    leftArm.position.set(0.3, 0.96, 0.04);
    body.add(leftArm);

    // Iconic white top crest with tiny twin red horns over 3 stacked crimson-and-black lacquer sode plates!
    const sodeCap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.24), whiteMetalMat);
    sodeCap.position.set(0.05, 0.08, 0.02);
    sodeCap.rotation.z = -0.32;
    leftArm.add(sodeCap);
    for (const hz of [-0.05, 0.05]) {
      const miniHorn = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.085, 6), crimsonMat);
      miniHorn.position.set(0.06, 0.15, hz + 0.02);
      leftArm.add(miniHorn);
    }
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.065, 0.25),
        i % 2 === 0 ? armorDarkMat : crimsonMat,
      );
      plate.position.set(0.08 + i * 0.015, 0.01 - i * 0.072, 0.02);
      plate.rotation.z = -0.26;
      plate.castShadow = true;
      leftArm.add(plate);
    }

    const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 0.24, 10), whiteCoatMat);
    lSleeve.position.set(0.02, -0.18, 0.12);
    lSleeve.rotation.x = 0.65;
    leftArm.add(lSleeve);

    const lGauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), armorDarkMat);
    lGauntlet.position.set(-0.02, -0.24, 0.24);
    leftArm.add(lGauntlet);

    const lWristBow = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 12), crimsonMat);
    lWristBow.position.set(-0.01, -0.22, 0.2);
    leftArm.add(lWristBow);

    // 4. Right Arm (-X, viewer's left in front view): Wide White Kimono Sleeve + Iconic White-Hilted Katana!
    const rightArm = new THREE.Group();
    rightArm.position.set(-0.3, 0.96, 0.04);
    body.add(rightArm);

    const rSleeve = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 10), whiteCoatMat);
    rSleeve.rotation.z = 0.72;
    rSleeve.rotation.x = 0.35;
    rSleeve.position.set(-0.1, -0.04, 0.1);
    rSleeve.castShadow = true;
    rightArm.add(rSleeve);

    const rBracer = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.082, 0.14, 10), armorDarkMat);
    rBracer.position.set(-0.08, 0.02, 0.19);
    rBracer.rotation.x = 0.4;
    rightArm.add(rBracer);

    const rBracerTrim = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 12), crimsonMat);
    rBracerTrim.rotation.x = Math.PI / 2;
    rBracerTrim.position.set(-0.08, 0.0, 0.18);
    rightArm.add(rBracerTrim);

    // Iconic Scarlet White-Hilted Curved Blade (Fleetly Fading) poised diagonally across front!
    const swordGroup = new THREE.Group();
    swordGroup.position.set(-0.36, 0.98, 0.26);
    body.add(swordGroup);

    const rGlove = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 10), armorDarkMat);
    swordGroup.add(rGlove);

    const swordAxis = new THREE.Group();
    // Tilt diagonally from upper-left (-X, viewer's left) down across to lower-right (+X, viewer's right)
    swordAxis.rotation.z = 0.64;
    swordAxis.rotation.y = 0.18;
    swordAxis.rotation.x = 0.12;
    swordGroup.add(swordAxis);

    // Sleek white futuristic hilt / grip frame
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.065), whiteMetalMat);
    hilt.position.set(0, 0.14, 0);
    hilt.castShadow = true;
    swordAxis.add(hilt);

    const hiltGuard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.08), armorDarkMat);
    hiltGuard.position.set(0.02, -0.08, 0);
    swordAxis.add(hiltGuard);

    // Dangling black lanyard strap at top pommel
    const pommelStrap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.22, 0.02), armorDarkMat);
    pommelStrap.position.set(-0.06, 0.29, -0.01);
    pommelStrap.rotation.z = -0.35;
    swordAxis.add(pommelStrap);

    // Curved metallic silver-and-dark samurai katana blade (proportioned cleanly above ground)
    const bladeMain = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.92, 0.024), bladeSilverMat);
    bladeMain.position.set(0.01, -0.55, 0);
    bladeMain.castShadow = true;
    swordAxis.add(bladeMain);

    const bladeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.9, 0.03), armorDarkMat);
    bladeSpine.position.set(-0.025, -0.54, 0);
    swordAxis.add(bladeSpine);

    const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.2, 4), bladeSilverMat);
    bladeTip.scale.set(1.0, 1.0, 0.35);
    bladeTip.rotation.x = Math.PI;
    bladeTip.position.set(0.01, -1.11, 0);
    swordAxis.add(bladeTip);

    // Warm Glowing Mini Lantern hanging cleanly at her hip cord (illuminates the dark island!)
    const hangingLantern = new THREE.Group();
    hangingLantern.position.set(-0.38, 0.78, -0.2);
    const lanternCord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6), goldMat);
    lanternCord.position.y = -0.09;
    hangingLantern.add(lanternCord);

    const lampBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 12, 12),
      new THREE.MeshStandardMaterial({
        color: PALETTE.lanternCore,
        emissive: PALETTE.lanternLit,
        emissiveIntensity: 2.5,
      }),
    );
    lampBody.scale.set(0.95, 1.15, 0.95);
    lampBody.position.y = -0.26;
    hangingLantern.add(lampBody);

    const lampBand = new THREE.Mesh(new THREE.TorusGeometry(0.138, 0.014, 6, 16), goldMat);
    lampBand.rotation.x = Math.PI / 2;
    lampBand.position.y = -0.26;
    hangingLantern.add(lampBand);

    const lanternTassel = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.14, 6), crimsonMat);
    lanternTassel.rotation.x = Math.PI;
    lanternTassel.position.y = -0.45;
    hangingLantern.add(lanternTassel);
    body.add(hangingLantern);

    // 5. Oversized Chibi Head + Choppy Lavender-Silver Bangs + Warm Amber Eyes + Confident Smile
    const headY = 1.38;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.41, 20, 20), skinMat);
    head.scale.set(1.05, 0.94, 0.96);
    head.position.y = headY;
    head.castShadow = true;
    body.add(head);

    const hairDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.445, 20, 18, 0, Math.PI * 2, 0, Math.PI * 0.7),
      hairMat,
    );
    hairDome.position.set(0, headY + 0.03, -0.02);
    hairDome.rotation.x = -0.2;
    hairDome.castShadow = true;
    body.add(hairDome);

    // Choppy layered forehead bangs & cheek-framing lavender-silver side locks
    const bangSpecs: [number, number, number, number][] = [
      [0, headY + 0.14, 0.39, 0.04],
      [-0.14, headY + 0.15, 0.37, 0.22],
      [0.14, headY + 0.15, 0.37, -0.22],
      [-0.27, headY + 0.08, 0.3, 0.36],
      [0.27, headY + 0.08, 0.3, -0.36],
    ];
    for (const [bx, by, bz, rz] of bangSpecs) {
      const bang = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 7), hairMat);
      bang.scale.set(1.0, 1.0, 0.42);
      bang.rotation.x = Math.PI;
      bang.rotation.z = rz;
      bang.position.set(bx, by, bz);
      body.add(bang);
    }

    for (const sx of [-1, 1]) {
      const sideLock = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 6, 10), hairDarkMat);
      sideLock.scale.set(0.82, 1.0, 0.95);
      sideLock.position.set(sx * 0.38, headY - 0.12, 0.12);
      sideLock.rotation.z = sx * 0.14;
      body.add(sideLock);
    }

    // Warm Amber-Brown Chibi Eyes, Blush & Playful Confident Smile
    const irisDarkMat = new THREE.MeshBasicMaterial({ color: '#452c1c' });
    const irisAmberMat = new THREE.MeshBasicMaterial({ color: '#9c6b41' });
    const irisGoldMat = new THREE.MeshBasicMaterial({ color: '#e1b57d' });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const blushMat = new THREE.MeshBasicMaterial({ color: '#f7b2be' });

    for (const sx of [-0.155, 0.155]) {
      const eyeOuter = new THREE.Mesh(new THREE.SphereGeometry(0.086, 12, 12), irisDarkMat);
      eyeOuter.scale.set(1.08, 1.12, 0.48);
      eyeOuter.position.set(sx, headY - 0.04, 0.375);
      body.add(eyeOuter);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), irisAmberMat);
      iris.scale.set(1.02, 0.96, 0.44);
      iris.position.set(sx, headY - 0.052, 0.392);
      body.add(iris);

      const lowerGlow = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), irisGoldMat);
      lowerGlow.scale.set(1.12, 0.65, 0.4);
      lowerGlow.position.set(sx, headY - 0.082, 0.4);
      body.add(lowerGlow);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), glintMat);
      glint.position.set(sx + 0.022, headY - 0.008, 0.412);
      body.add(glint);

      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.066, 8, 8), blushMat);
      blush.scale.set(1.22, 0.54, 0.38);
      blush.position.set(sx * 1.48, headY - 0.13, 0.358);
      body.add(blush);
    }

    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 6, 12, Math.PI), irisDarkMat);
    smile.rotation.z = Math.PI;
    smile.position.set(0, headY - 0.155, 0.395);
    body.add(smile);

    // 6. THE ICONIC HUGE CONICAL WHITE MECHA-KASA HAT WITH CRIMSON TRIM, BLACK PLUME & TWIN ARMORED FLAPS!
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, headY + 0.4, -0.02);
    // Jaunty tilt matching the reference art (slightly tilted back + dipped toward +X)
    hatGroup.rotation.x = -0.14;
    hatGroup.rotation.z = -0.12;
    body.add(hatGroup);

    const kasaMat = new THREE.MeshStandardMaterial({
      map: this.createScarletHatTexture(),
      roughness: 0.38,
      metalness: 0.14,
      side: THREE.DoubleSide,
    });
    const kasaCone = new THREE.Mesh(new THREE.ConeGeometry(0.96, 0.44, 32, 1, true), kasaMat);
    kasaCone.position.y = 0.08;
    kasaCone.castShadow = true;
    hatGroup.add(kasaCone);

    // Underside shadow liner & crisp crimson outer rim border
    const kasaInner = new THREE.Mesh(
      new THREE.ConeGeometry(0.94, 0.42, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: '#3b3944', roughness: 0.85, side: THREE.BackSide }),
    );
    kasaInner.position.y = 0.065;
    hatGroup.add(kasaInner);

    const brimTrim = new THREE.Mesh(new THREE.TorusGeometry(0.955, 0.022, 8, 36), armorDarkMat);
    brimTrim.rotation.x = Math.PI / 2;
    brimTrim.position.y = -0.14;
    hatGroup.add(brimTrim);

    // Sculpted curved dark-charcoal flame/crest plume crowning the apex of the kasa hat
    const plumeSpecs: [number, number, number, number, number][] = [
      [0, 0.33, -0.02, -0.55, 0.0],
      [-0.1, 0.3, 0.04, -0.35, 0.48],
      [0.11, 0.29, -0.05, -0.7, -0.45],
    ];
    for (const [px, py, pz, rx, rz] of plumeSpecs) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.28, 7), armorDarkMat);
      crest.position.set(px, py, pz);
      crest.rotation.x = rx;
      crest.rotation.z = rz;
      crest.castShadow = true;
      hatGroup.add(crest);
    }

    // Twin hanging segmented red-and-white armored hat side plates (shikoro) + twin dark straps!
    const makeHatFlap = (side: -1 | 1): THREE.Group => {
      const flap = new THREE.Group();
      flap.position.set(side * 0.86, -0.1, 0.02);
      flap.rotation.z = side * 0.24;

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.2), whiteMetalMat);
      cap.position.y = -0.02;
      flap.add(cap);

      for (const hz of [-0.04, 0.04]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 5), whiteMetalMat);
        horn.position.set(0, 0.06, hz);
        flap.add(horn);
      }

      for (let i = 0; i < 3; i++) {
        const redPlate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.068, 0.22), crimsonMat);
        redPlate.position.set(side * 0.02 * i, -0.11 - i * 0.072, 0);
        redPlate.castShadow = true;
        flap.add(redPlate);
      }

      for (const sz of [-0.05, 0.05]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.03), armorDarkMat);
        strap.position.set(side * 0.05, -0.38, sz);
        strap.rotation.z = side * 0.18;
        flap.add(strap);
      }

      hatGroup.add(flap);
      return flap;
    };
    const hatFlapLeft = makeHatFlap(1);
    const hatFlapRight = makeHatFlap(-1);

    const light = new THREE.PointLight(PALETTE.lanternLit, 2.6, 18, 1.45);
    light.position.set(-0.42, 0.72, -0.12);
    body.add(light);

    const invulnShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 14, 14),
      new THREE.MeshBasicMaterial({
        color: PALETTE.goldAccent,
        transparent: true,
        opacity: 0.3,
        wireframe: true,
      }),
    );
    invulnShell.position.y = 0.98;
    invulnShell.visible = false;
    group.add(invulnShell);

    const dashAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.07, 6, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent, transparent: true, opacity: 0.72 }),
    );
    dashAura.rotation.x = Math.PI / 2;
    dashAura.position.y = 0.7;
    dashAura.visible = false;
    group.add(dashAura);

    // Client-only Firefly Compass ring at feet
    const compassArrow = new THREE.Group();
    compassArrow.position.y = 0.1;
    const pointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.45, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent, transparent: true, opacity: 0.85 }),
    );
    pointer.rotation.x = Math.PI / 2;
    pointer.position.z = 1.35;
    compassArrow.add(pointer);
    group.add(compassArrow);

    return {
      group,
      body,
      hatFlapLeft,
      hatFlapRight,
      swordGroup,
      footLeft,
      footRight,
      capeFlow,
      hangingLantern,
      light,
      invulnShell,
      dashAura,
      compassArrow,
    };
  }

  private createLanternVisual(): LanternVisual {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.15, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.lanternUnlit, roughness: 0.9 }),
    );
    base.position.y = 0.22;
    base.receiveShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.3, 3.3, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 }),
    );
    pillar.position.y = 2.0;
    pillar.castShadow = true;
    group.add(pillar);

    const bulbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternUnlit,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), bulbMat);
    bulb.position.y = 3.85;
    group.add(bulb);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.75 }),
    );
    roof.position.y = 4.65;
    roof.castShadow = true;
    group.add(roof);

    const light = new THREE.PointLight(PALETTE.lanternLit, 0, 22, 1.4);
    light.position.y = 4.0;
    group.add(light);

    const ringGeom = new THREE.RingGeometry(TUNING.safe_radius - 0.14, TUNING.safe_radius, 48);
    ringGeom.rotateX(-Math.PI / 2);
    const safeRing = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    safeRing.position.y = 0.08;
    safeRing.visible = false;
    group.add(safeRing);

    const progressOrbs: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo }),
      );
      orb.position.set(Math.cos(angle) * 0.9, 1.65, Math.sin(angle) * 0.9);
      orb.visible = false;
      group.add(orb);
      progressOrbs.push(orb);
    }

    return { group, bulbMat, light, safeRing, progressOrbs };
  }

  private createMoteVisual(): MoteVisual {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
    );
    group.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 12),
      new THREE.MeshBasicMaterial({
        color: PALETTE.moteHalo,
        transparent: true,
        opacity: 0.36,
      }),
    );
    group.add(halo);

    const wingGeom = new THREE.PlaneGeometry(0.32, 0.16);
    const wingMat = new THREE.MeshBasicMaterial({
      color: PALETTE.moteCore,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    });
    const wingLeft = new THREE.Mesh(wingGeom, wingMat);
    wingLeft.position.set(-0.24, 0.1, 0);
    group.add(wingLeft);

    const wingRight = new THREE.Mesh(wingGeom, wingMat);
    wingRight.position.set(0.24, 0.1, 0);
    group.add(wingRight);

    return { group, wingLeft, wingRight };
  }

  private createShadeVisual(shadeId: string): ShadeVisual {
    const group = new THREE.Group();
    const inner = new THREE.Group();
    group.add(inner);

    const phaseOffset = this.hashVariant(shadeId, 16) * 0.75;

    // Authentic 3D Doro materials (plump white body, sakura-pink hair, lavender eyes, purple bow + white ribbon)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#fcfbfd',
      emissive: '#2b1c36',
      emissiveIntensity: 0.08,
      roughness: 0.58,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: '#f9a5c4',
      emissive: '#4a1c36',
      emissiveIntensity: 0.1,
      roughness: 0.55,
    });
    const hairShadowMat = new THREE.MeshStandardMaterial({
      color: '#df7aa4',
      roughness: 0.62,
    });
    const purpleBowMat = new THREE.MeshStandardMaterial({
      color: '#8f72c4',
      roughness: 0.52,
    });
    const whiteRibbonMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    const inkMat = new THREE.MeshBasicMaterial({ color: '#1b1420' });
    const eyeUpperMat = new THREE.MeshBasicMaterial({ color: '#8d72cf' });
    const eyeLowerMat = new THREE.MeshBasicMaterial({ color: '#ccc0f8' });
    const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const blushMat = new THREE.MeshBasicMaterial({ color: '#f9b4c2' });

    // 1. Plump pure-white quadrupedal body + 4 animated stubby legs
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.47, 18, 16), bodyMat);
    torso.scale.set(1.04, 0.84, 1.38);
    torso.position.set(0, 0.48, -0.08);
    torso.castShadow = true;
    inner.add(torso);

    // Slight cute raised rump curve at back
    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), bodyMat);
    rump.scale.set(1.06, 0.92, 0.95);
    rump.position.set(0, 0.52, -0.44);
    rump.castShadow = true;
    inner.add(rump);

    const legs: THREE.Group[] = [];
    const legCoords: [number, number][] = [
      [0.25, 0.32], // front-left
      [-0.25, 0.32], // front-right
      [0.25, -0.44], // back-left
      [-0.25, -0.44], // back-right
    ];
    for (const [lx, lz] of legCoords) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.3, lz);
      const paw = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.16, 8, 12), bodyMat);
      paw.position.y = -0.14;
      paw.castShadow = true;
      pivot.add(paw);
      inner.add(pivot);
      legs.push(pivot);
    }

    // 2. Iconic Chubby Mochi Doro Face (integrated smoothly at front +Z)
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 16), bodyMat);
    face.scale.set(1.16, 0.9, 0.86);
    face.position.set(0, 0.62, 0.36);
    face.castShadow = true;
    inner.add(face);

    // Big round lavender eyes with black ink ring, 2-tone iris, white highlight, smug brows & blush
    for (const sx of [-1, 1]) {
      const ex = sx * 0.2;
      const eyeRim = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 14), inkMat);
      eyeRim.scale.set(1.04, 1.04, 0.35);
      eyeRim.position.set(ex, 0.61, 0.69);
      inner.add(eyeRim);

      const eyeIris = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 12), eyeUpperMat);
      eyeIris.scale.set(1.02, 1.02, 0.35);
      eyeIris.position.set(ex, 0.61, 0.712);
      inner.add(eyeIris);

      const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.086, 10, 10), eyeLowerMat);
      eyeGlow.scale.set(1.06, 0.64, 0.34);
      eyeGlow.position.set(ex, 0.565, 0.726);
      inner.add(eyeGlow);

      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), glintMat);
      glint.position.set(ex - 0.032, 0.66, 0.742);
      inner.add(glint);

      // Smug tilted dark brow (\ /)
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.034, 0.04), inkMat);
      brow.position.set(ex, 0.74, 0.72);
      brow.rotation.z = sx * 0.16;
      inner.add(brow);

      // Rosy peach-pink cheek blush
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), blushMat);
      blush.scale.set(1.3, 0.62, 0.34);
      blush.position.set(sx * 0.34, 0.48, 0.66);
      inner.add(blush);
    }

    // Iconic smug :3 (ω) cat mouth right between the rosy cheeks!
    for (const mx of [-0.048, 0.048]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.014, 6, 14, Math.PI), inkMat);
      arc.rotation.z = Math.PI;
      arc.position.set(mx, 0.5, 0.745);
      inner.add(arc);
    }

    // 3. Sakura-Pink Hair Canopy, Bangs, Cheek-Framing Sweeps, Rose-Swirl Bun & Purple Bow + White Ribbons!
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 18, 0, Math.PI * 2, 0, Math.PI * 0.64),
      hairMat,
    );
    hairCrown.scale.set(1.12, 0.96, 1.04);
    hairCrown.position.set(0, 0.71, 0.32);
    hairCrown.rotation.x = -0.18;
    hairCrown.castShadow = true;
    inner.add(hairCrown);

    // Pointed forehead bangs draping between eyes
    const bangSpecs: [number, number, number, number][] = [
      [0, 0.76, 0.72, 0.0],
      [-0.14, 0.78, 0.7, 0.2],
      [0.14, 0.78, 0.7, -0.2],
    ];
    for (const [bx, by, bz, rz] of bangSpecs) {
      const bang = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), hairMat);
      bang.scale.set(1.0, 1.0, 0.42);
      bang.rotation.x = Math.PI;
      bang.rotation.z = rz;
      bang.position.set(bx, by, bz);
      inner.add(bang);
    }

    // Wide sweeping pink cheek-framing hair curtains on both sides (classic Doro silhouette!)
    for (const sx of [-1, 1]) {
      const sideCurtain = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 8, 12), hairMat);
      sideCurtain.scale.set(0.82, 1.0, 1.25);
      sideCurtain.position.set(sx * 0.48, 0.62, 0.34);
      sideCurtain.rotation.z = sx * -0.34;
      sideCurtain.castShadow = true;
      inner.add(sideCurtain);

      // Cute flared outer wing tip + inward cheek-hugging tip
      const flareTip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), hairMat);
      flareTip.scale.set(1.0, 1.0, 0.5);
      flareTip.rotation.z = sx * -1.05;
      flareTip.position.set(sx * 0.58, 0.46, 0.28);
      inner.add(flareTip);

      const cheekCurl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), hairMat);
      cheekCurl.rotation.x = Math.PI;
      cheekCurl.rotation.z = sx * 0.45;
      cheekCurl.position.set(sx * 0.4, 0.38, 0.5);
      inner.add(cheekCurl);
    }

    // Back-left pink rose-swirl hair bun (+X side-back, matching viewer's right in Image 2!)
    const roseBunGroup = new THREE.Group();
    roseBunGroup.position.set(0.32, 0.9, -0.02);
    roseBunGroup.rotation.y = 0.62;
    roseBunGroup.rotation.z = -0.22;

    const bunCore = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), hairMat);
    bunCore.scale.set(1.08, 1.02, 0.9);
    bunCore.castShadow = true;
    roseBunGroup.add(bunCore);

    // Concentric rose-petal swirl rings on the bun face
    const swirlOuter = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 6, 16), hairShadowMat);
    swirlOuter.position.z = 0.16;
    roseBunGroup.add(swirlOuter);

    const swirlInner = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.024, 6, 12), hairShadowMat);
    swirlInner.position.z = 0.185;
    roseBunGroup.add(swirlInner);
    inner.add(roseBunGroup);

    // Purple ribbon bow tucked right under the rose bun + crisp white ribbon tails!
    const ribbonTail = new THREE.Group();
    ribbonTail.position.set(0.34, 0.72, -0.14);
    ribbonTail.rotation.y = 0.55;

    const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), purpleBowMat);
    bowKnot.position.z = 0.08;
    ribbonTail.add(bowKnot);

    for (const bx of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.19, 6), purpleBowMat);
      loop.scale.set(1.0, 1.0, 0.45);
      loop.rotation.z = bx * (Math.PI / 2 - 0.2);
      loop.position.set(bx * 0.11, 0.02, 0.08);
      ribbonTail.add(loop);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.025), purpleBowMat);
      tail.position.set(bx * 0.06, -0.11, 0.07);
      tail.rotation.z = bx * 0.28;
      ribbonTail.add(tail);
    }

    // Crisp white butterfly-wing ribbon behind the purple bow
    const whiteWingTop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), whiteRibbonMat);
    whiteWingTop.scale.set(1.0, 1.0, 0.2);
    whiteWingTop.rotation.z = -1.25;
    whiteWingTop.position.set(0.12, 0.06, -0.02);
    ribbonTail.add(whiteWingTop);

    const whiteWingBot = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.36, 4), whiteRibbonMat);
    whiteWingBot.scale.set(1.0, 1.0, 0.2);
    whiteWingBot.rotation.z = -2.45;
    whiteWingBot.position.set(0.08, -0.15, -0.02);
    ribbonTail.add(whiteWingBot);
    inner.add(ribbonTail);

    // 4. Visual State Indicators (Stunned dizzy stars halo, Chase aggro ring, Spawning portal ring)
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.045, 6, 20),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 1.38, 0.2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1, 0),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
      );
      star.position.set(Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0);
      halo.add(star);
    }
    halo.visible = false;
    group.add(halo);

    const chaseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.92, 24),
      new THREE.MeshBasicMaterial({
        color: PALETTE.shadeEdge,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
      }),
    );
    chaseRing.rotation.x = -Math.PI / 2;
    chaseRing.position.y = 0.06;
    chaseRing.visible = false;
    group.add(chaseRing);

    const spawnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 1.05, 24),
      new THREE.MeshBasicMaterial({
        color: '#f48fb1',
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    );
    spawnRing.rotation.x = -Math.PI / 2;
    spawnRing.position.y = 0.08;
    spawnRing.visible = false;
    group.add(spawnRing);

    return { group, inner, phaseOffset, bodyMat, hairMat, chaseRing, halo, spawnRing, legs, ribbonTail };
  }

  private createDrifterVisual(drifterId: string): DrifterVisual {
    const group = new THREE.Group();
    const coreGroup = new THREE.Group();
    group.add(coreGroup);

    const variant = this.hashVariant(drifterId, 2);
    const silkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: PALETTE.drifter,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.86,
      roughness: 0.4,
    });
    const spiritCoreMat = new THREE.MeshBasicMaterial({ color: '#dcecff' });
    const ribbons: THREE.Object3D[] = [];

    if (variant === 0) {
      // Variant 0: Silk Wind-Crane (swept translucent wings + twin trailing silk ribbons)
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 1), spiritCoreMat);
      body.scale.set(0.85, 0.7, 1.5);
      coreGroup.add(body);

      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.35, 4), silkMat);
        wing.scale.set(1.0, 1.0, 0.2);
        wing.rotation.z = sx * -1.25;
        wing.position.set(sx * 0.68, 0.08, -0.05);
        coreGroup.add(wing);
        ribbons.push(wing);

        const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 1.55), silkMat);
        tail.rotation.x = Math.PI / 2;
        tail.position.set(sx * 0.22, 0, -1.05);
        coreGroup.add(tail);
        ribbons.push(tail);
      }
    } else {
      // Variant 1: Mist Ribbon Fox-Spirit (sleek mask + twin ears + 3 flowing silk tails)
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.85, 6), silkMat);
      head.rotation.x = Math.PI / 2;
      coreGroup.add(head);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), spiritCoreMat);
      core.position.z = 0.08;
      coreGroup.add(core);

      for (const sx of [-0.2, 0.2]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 4), silkMat);
        ear.position.set(sx, 0.34, 0.05);
        ear.rotation.z = sx * -0.4;
        coreGroup.add(ear);
      }

      for (let i = -1; i <= 1; i++) {
        const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1.75), silkMat);
        tail.rotation.x = Math.PI / 2;
        tail.rotation.z = i * 0.22;
        tail.position.set(i * 0.28, Math.abs(i) * 0.08, -1.1);
        coreGroup.add(tail);
        ribbons.push(tail);
      }
    }

    const stolenOrbs: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 10, 10),
        new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
      );
      orb.visible = false;
      group.add(orb);
      stolenOrbs.push(orb);
    }
    return { group, variant, coreGroup, ribbons, stolenOrbs };
  }

  private createCharmVisual(): CharmVisual {
    const group = new THREE.Group();
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.9, 0.08),
      new THREE.MeshStandardMaterial({
        color: PALETTE.mayScarfAndCharm,
        emissive: PALETTE.mayScarfAndCharm,
        emissiveIntensity: 0.55,
      }),
    );
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.98, 0.04),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldAccent }),
    );
    card.add(border);
    card.position.y = 1.15;
    group.add(card);

    const ringGeom = new THREE.RingGeometry(0.75, 0.95, 24);
    ringGeom.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({
        color: PALETTE.goldAccent,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.y = 0.06;
    group.add(ring);

    return { group, card, ring };
  }
}
