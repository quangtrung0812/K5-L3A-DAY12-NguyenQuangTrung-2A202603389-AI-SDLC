import * as THREE from 'three';
import { ISLAND_RADIUS, TUNING } from '../sim/tuning.js';
import type { LanternIslandSim } from '../sim/engine.js';

interface LanternVisual {
  group: THREE.Group;
  bulb: THREE.Mesh;
  bulbMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  progressArcs: THREE.Mesh[];
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  leftEyeMat: THREE.MeshBasicMaterial;
  rightEyeMat: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
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

  private hemiLight: THREE.HemisphereLight;
  private moonLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private playerGroup: THREE.Group;
  private playerBody: THREE.Group;
  private hangingLantern: THREE.Group;
  private playerLight: THREE.PointLight;
  private invulnShell: THREE.Mesh;
  private compassArrow: THREE.Group; // Client-only creative feature: Firefly Compass

  private lanternVisuals = new Map<string, LanternVisual>();
  private moteVisuals = new Map<string, THREE.Group>();
  private shadeVisuals = new Map<string, ShadeVisual>();
  private cloudPuffs: { mesh: THREE.Mesh; angle: number; radius: number; speed: number; y: number }[] = [];
  private pulseWaves: PulseWave[] = [];

  private elapsed = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0c1026');
    this.fog = new THREE.FogExp2('#0c1026', 0.0155);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(
      54,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      260,
    );

    // Night fairy-tale lighting (warms up dynamically as lanterns are lit)
    this.hemiLight = new THREE.HemisphereLight('#5e72b8', '#1b162e', 0.55);
    this.scene.add(this.hemiLight);

    this.moonLight = new THREE.DirectionalLight('#9ab4ff', 0.65);
    this.moonLight.position.set(22, 36, -18);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 110;
    const d = 44;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);

    this.buildSkyAndSeaOfClouds();
    this.buildIsland();

    const playerRig = this.buildPlayerMay();
    this.playerGroup = playerRig.group;
    this.playerBody = playerRig.body;
    this.hangingLantern = playerRig.hangingLantern;
    this.playerLight = playerRig.light;
    this.invulnShell = playerRig.invulnShell;
    this.compassArrow = playerRig.compassArrow;
    this.scene.add(this.playerGroup);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  triggerPulseEffect(pos: [number, number, number]): void {
    const geom = new THREE.RingGeometry(0.4, 0.85, 48);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffbe55',
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(pos[0], 0.25, pos[2]);
    this.scene.add(mesh);
    this.pulseWaves.push({ mesh, age: 0, maxAge: 0.45 });
  }

  sync(sim: LanternIslandSim, camYawDeg: number, dt: number): void {
    this.elapsed += dt;

    // 1. Dynamic atmosphere brightening as lanterns light up (0..5)
    const litCount = sim.lanterns.filter((l) => l.lit).length;
    const progress = litCount / Math.max(1, sim.lanterns.length);
    const skyDark = new THREE.Color('#0c1026');
    const skyWarm = new THREE.Color('#271e38');
    const skyColor = skyDark.clone().lerp(skyWarm, progress);
    this.scene.background = skyColor;
    this.fog.color.copy(skyColor);
    this.fog.density = 0.0155 - progress * 0.006;

    this.hemiLight.intensity = 0.55 + progress * 0.65;
    this.hemiLight.color.set('#5e72b8').lerp(new THREE.Color('#ffcb8a'), progress * 0.75);
    this.moonLight.intensity = 0.65 + progress * 0.55;
    this.moonLight.color.set('#9ab4ff').lerp(new THREE.Color('#ffd39b'), progress * 0.65);

    // 2. Player Mây
    this.playerGroup.position.set(sim.player.pos[0], sim.player.pos[1], sim.player.pos[2]);
    this.playerBody.rotation.y = sim.player.yawRad;
    this.hangingLantern.rotation.z = Math.sin(this.elapsed * 4.2) * 0.14;
    this.playerLight.intensity = 1.6 + sim.player.carried * 0.45;
    this.invulnShell.visible = sim.player.invulnTicks > 0 && Math.floor(this.elapsed * 16) % 2 === 0;

    // Client-only Firefly Compass pointing to nearest unlit lantern
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
    if (nearestUnlit) {
      this.compassArrow.visible = true;
      const angle = Math.atan2(nearestUnlit[0] - sim.player.pos[0], nearestUnlit[2] - sim.player.pos[2]);
      this.compassArrow.rotation.y = angle;
    } else {
      this.compassArrow.visible = false;
    }

    // 3. Third-person camera following Mây along cam_yaw_deg
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 13.5;
    const camHeight = 8.5;
    const targetCamPos = new THREE.Vector3(
      sim.player.pos[0] - Math.sin(theta) * camDist,
      sim.player.pos[1] + camHeight,
      sim.player.pos[2] - Math.cos(theta) * camDist,
    );
    this.camera.position.lerp(targetCamPos, Math.min(1, dt * 10));
    this.camera.lookAt(sim.player.pos[0], sim.player.pos[1] + 1.4, sim.player.pos[2]);

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
        vis.bulbMat.color.set('#ffcf70');
        vis.bulbMat.emissive.set('#ff9933');
        vis.bulbMat.emissiveIntensity = 2.6 * pulse;
        vis.light.intensity = 18 * pulse;
        vis.safeRing.visible = true;
      } else {
        vis.bulbMat.color.set('#3d4261').lerp(new THREE.Color('#ffbe66'), ratio * 0.7);
        vis.bulbMat.emissive.set('#ff9a3d');
        vis.bulbMat.emissiveIntensity = ratio * 1.1;
        vis.light.intensity = ratio * 4.5;
        vis.safeRing.visible = false;
      }

      vis.progressArcs.forEach((orb, idx) => {
        const active = lantern.lit || idx < lantern.deposited;
        orb.visible = active;
        orb.position.y = 1.6 + Math.sin(this.elapsed * 3 + idx) * 0.08;
      });
    }

    // 5. Motes (Fireflies)
    const activeMoteIds = new Set<string>();
    for (const mote of sim.motes) {
      activeMoteIds.add(mote.id);
      let vis = this.moteVisuals.get(mote.id);
      if (!vis) {
        vis = this.createMoteVisual();
        this.moteVisuals.set(mote.id, vis);
        this.scene.add(vis);
      }
      const bob = 0.85 + Math.sin(this.elapsed * 3.8 + mote.pos[0] * 0.7 + mote.pos[2] * 0.5) * 0.25;
      vis.position.set(mote.pos[0], bob, mote.pos[2]);
      vis.rotation.y = this.elapsed * 1.6;
    }
    for (const [id, vis] of this.moteVisuals.entries()) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(vis);
        this.moteVisuals.delete(id);
      }
    }

    // 6. Shades (Bóng Mực)
    const activeShadeIds = new Set<string>();
    for (const shade of sim.shades) {
      activeShadeIds.add(shade.id);
      let vis = this.shadeVisuals.get(shade.id);
      if (!vis) {
        vis = this.createShadeVisual();
        this.shadeVisuals.set(shade.id, vis);
        this.scene.add(vis.group);
      }
      const floatY = 1.05 + Math.sin(this.elapsed * 4.5 + shade.pos[0]) * 0.16;
      vis.group.position.set(shade.pos[0], floatY, shade.pos[2]);
      vis.group.lookAt(sim.player.pos[0], floatY, sim.player.pos[2]);

      const stunned = shade.state === 'stunned';
      vis.bodyMat.color.set(stunned ? '#4b3b75' : '#180c29');
      vis.bodyMat.emissive.set(stunned ? '#7e5bef' : '#3a115e');
      vis.leftEyeMat.color.set(stunned ? '#ffe082' : '#d65cff');
      vis.rightEyeMat.color.set(stunned ? '#ffe082' : '#d65cff');
      vis.halo.visible = stunned;
      if (stunned) {
        vis.halo.rotation.z = this.elapsed * 5;
      }
    }
    for (const [id, vis] of this.shadeVisuals.entries()) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // 7. Ambient clouds drift
    for (const c of this.cloudPuffs) {
      c.angle += c.speed * dt;
      c.mesh.position.set(Math.cos(c.angle) * c.radius, c.y, Math.sin(c.angle) * c.radius);
    }

    // 8. Pulse shockwaves
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
        const scale = 1 + t * (TUNING.pulse_radius * 1.15);
        wave.mesh.scale.set(scale, 1, scale);
        (wave.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private buildSkyAndSeaOfClouds(): void {
    // Twinkling stars
    const starPositions: number[] = [];
    for (let i = 0; i < 320; i++) {
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = 0.25 + ((i * 29) % 100) / 140;
      const r = 130;
      starPositions.push(r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi) + 12, r * Math.cos(phi) * Math.sin(theta));
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: '#fff2cc', size: 0.9, transparent: true, opacity: 0.85 });
    this.scene.add(new THREE.Points(starGeom, starMat));

    // Glowing crescent/full moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#fff3d6' }),
    );
    moon.position.set(55, 65, -75);
    this.scene.add(moon);

    // Sea of clouds surrounding the island
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#2b2d52',
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.82,
    });
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const radius = ISLAND_RADIUS + 10 + (i % 4) * 7;
      const scale = 5.5 + (i % 3) * 2.5;
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 1), cloudMat);
      puff.scale.set(1.5, 0.55, 1.2);
      const y = -3.8 - (i % 3) * 1.4;
      puff.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      this.scene.add(puff);
      this.cloudPuffs.push({ mesh: puff, angle, radius, speed: 0.012 + (i % 3) * 0.005, y });
    }
  }

  private buildIsland(): void {
    // Circular island ground at Y = 0
    const groundGeom = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.88, 4.5, 48);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#24303e',
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.y = -2.25;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Central stone sanctuary mosaic around (0, 0, 0)
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 5.0, 0.14, 24),
      new THREE.MeshStandardMaterial({ color: '#3b4259', roughness: 0.85 }),
    );
    plaza.position.y = 0.03;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Decorative harbor pier ("Đảo Bến") extending slightly at the edge (purely visual)
    const pierGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.85 });
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.22, 0.95), woodMat);
      plank.position.set(0, 0.05, ISLAND_RADIUS - 1.5 + i * 1.15);
      plank.receiveShadow = true;
      pierGroup.add(plank);
    }
    for (const sx of [-1.4, 1.4]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.2, 8), woodMat);
      post.position.set(sx, 0.6, ISLAND_RADIUS + 4.4);
      pierGroup.add(post);
    }
    this.scene.add(pierGroup);

    // Stylized fairy-tale pines & rocks near perimeter (outside lantern ring)
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4c3528', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#1f4048', roughness: 0.85 });
    const rockMat = new THREE.MeshStandardMaterial({ color: '#394054', roughness: 0.95 });

    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + 0.35;
      const dist = ISLAND_RADIUS - 3.6 - (i % 2) * 2.2;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.7, 7), trunkMat);
      trunk.position.y = 0.85;
      trunk.castShadow = true;
      tree.add(trunk);

      const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 7), leafMat);
      crown1.position.y = 2.4;
      crown1.castShadow = true;
      tree.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.9, 7), leafMat);
      crown2.position.y = 3.6;
      crown2.castShadow = true;
      tree.add(crown2);

      tree.position.set(x, 0, z);
      this.scene.add(tree);

      if (i % 2 === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), rockMat);
        rock.scale.set(1.2, 0.65, 1.0);
        rock.position.set(x * 0.92, 0.25, z * 0.92);
        this.scene.add(rock);
      }
    }

    // Subtle island rim ring
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ISLAND_RADIUS - 0.3, 0.25, 8, 64),
      new THREE.MeshStandardMaterial({ color: '#3a455e', roughness: 0.9 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    this.scene.add(rim);
  }

  private buildPlayerMay(): {
    group: THREE.Group;
    body: THREE.Group;
    hangingLantern: THREE.Group;
    light: THREE.PointLight;
    invulnShell: THREE.Mesh;
    compassArrow: THREE.Group;
  } {
    const group = new THREE.Group();
    const body = new THREE.Group();
    group.add(body);

    // Warm cloak & body
    const cloak = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.25, 12),
      new THREE.MeshStandardMaterial({ color: '#d96b43', roughness: 0.75 }),
    );
    cloak.position.y = 0.65;
    cloak.castShadow = true;
    body.add(cloak);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: '#ffd27d', roughness: 0.6 }),
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 1.15;
    body.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 14, 14),
      new THREE.MeshStandardMaterial({ color: '#fce0c4', roughness: 0.7 }),
    );
    head.position.y = 1.42;
    head.castShadow = true;
    body.add(head);

    // Conical hat (Nón lá)
    const nonLa = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 0.42, 18),
      new THREE.MeshStandardMaterial({ color: '#e6c580', roughness: 0.8 }),
    );
    nonLa.position.y = 1.72;
    nonLa.castShadow = true;
    body.add(nonLa);

    // Small warm lantern hanging from the front brim of the Nón lá
    const hangingLantern = new THREE.Group();
    hangingLantern.position.set(0, 1.54, 0.72);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.25, 6),
      new THREE.MeshBasicMaterial({ color: '#ffe5a3' }),
    );
    cord.position.y = -0.12;
    hangingLantern.add(cord);

    const miniLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshStandardMaterial({
        color: '#ffe08a',
        emissive: '#ff9d2e',
        emissiveIntensity: 2.2,
      }),
    );
    miniLamp.position.y = -0.28;
    hangingLantern.add(miniLamp);
    body.add(hangingLantern);

    const light = new THREE.PointLight('#ffaa44', 2.0, 13, 1.6);
    light.position.set(0, 1.4, 0.75);
    body.add(light);

    // Soft invulnerability shimmer shell
    const invulnShell = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 16),
      new THREE.MeshBasicMaterial({
        color: '#ffd27d',
        transparent: true,
        opacity: 0.28,
        wireframe: true,
      }),
    );
    invulnShell.position.y = 0.95;
    invulnShell.visible = false;
    group.add(invulnShell);

    // Client-only Firefly Compass ring on ground pointing toward nearest unlit lantern
    const compassArrow = new THREE.Group();
    compassArrow.position.y = 0.08;
    const pointer = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.45, 6),
      new THREE.MeshBasicMaterial({ color: '#ffca64', transparent: true, opacity: 0.85 }),
    );
    pointer.rotation.x = Math.PI / 2;
    pointer.position.z = 1.35;
    compassArrow.add(pointer);
    group.add(compassArrow);

    return { group, body, hangingLantern, light, invulnShell, compassArrow };
  }

  private createLanternVisual(): LanternVisual {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.15, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: '#42475e', roughness: 0.9 }),
    );
    base.position.y = 0.22;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.3, 3.3, 8),
      new THREE.MeshStandardMaterial({ color: '#543c2c', roughness: 0.85 }),
    );
    pillar.position.y = 2.0;
    pillar.castShadow = true;
    group.add(pillar);

    const bulbMat = new THREE.MeshStandardMaterial({
      color: '#3d4261',
      emissive: '#ff9a3d',
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    const bulb = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 1), bulbMat);
    bulb.position.y = 3.85;
    group.add(bulb);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.25, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: '#2b243b', roughness: 0.75 }),
    );
    roof.position.y = 4.65;
    roof.castShadow = true;
    group.add(roof);

    const light = new THREE.PointLight('#ffaa44', 0, 20, 1.4);
    light.position.y = 4.0;
    group.add(light);

    // Safe radius ground ring (visible when lit)
    const ringGeom = new THREE.RingGeometry(TUNING.safe_radius - 0.14, TUNING.safe_radius, 48);
    ringGeom.rotateX(-Math.PI / 2);
    const safeRing = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({
        color: '#ffbf5e',
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    safeRing.position.y = 0.06;
    safeRing.visible = false;
    group.add(safeRing);

    // Deposit progress orbs circling pillar
    const progressArcs: THREE.Mesh[] = [];
    for (let i = 0; i < TUNING.lantern_cost; i++) {
      const angle = (i / TUNING.lantern_cost) * Math.PI * 2;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 8),
        new THREE.MeshBasicMaterial({ color: '#ffd56b' }),
      );
      orb.position.set(Math.cos(angle) * 0.9, 1.6, Math.sin(angle) * 0.9);
      orb.visible = false;
      group.add(orb);
      progressArcs.push(orb);
    }

    return { group, bulb, bulbMat, light, safeRing, progressArcs };
  }

  private createMoteVisual(): THREE.Group {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10),
      new THREE.MeshBasicMaterial({ color: '#ffe07d' }),
    );
    group.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 10, 10),
      new THREE.MeshBasicMaterial({
        color: '#ff9f38',
        transparent: true,
        opacity: 0.34,
      }),
    );
    group.add(halo);
    return group;
  }

  private createShadeVisual(): ShadeVisual {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#180c29',
      emissive: '#3a115e',
      emissiveIntensity: 0.9,
      roughness: 0.65,
    });
    const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), bodyMat);
    body.scale.set(0.95, 1.3, 0.95);
    body.castShadow = true;
    group.add(body);

    const leftEyeMat = new THREE.MeshBasicMaterial({ color: '#d65cff' });
    const rightEyeMat = new THREE.MeshBasicMaterial({ color: '#d65cff' });
    const eyeGeom = new THREE.SphereGeometry(0.11, 8, 8);

    const leftEye = new THREE.Mesh(eyeGeom, leftEyeMat);
    leftEye.position.set(-0.22, 0.22, 0.64);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, rightEyeMat);
    rightEye.position.set(0.22, 0.22, 0.64);
    group.add(rightEye);

    // Stunned dizzy halo
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.06, 6, 18),
      new THREE.MeshBasicMaterial({ color: '#ffe082' }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.25;
    halo.visible = false;
    group.add(halo);

    return { group, bodyMat, leftEyeMat, rightEyeMat, halo };
  }
}
