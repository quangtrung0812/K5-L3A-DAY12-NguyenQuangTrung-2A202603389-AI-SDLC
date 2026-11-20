import { SHADE_NIGHT3_SPEED, TUNING } from './tuning.js';
import type { NightNumber, Vec3 } from './types.js';

export interface LaunchpadDef {
  pos: Vec3;
  radius: number;
  vy: number;
  vx: number;
  vz: number;
}

export interface RampDef {
  angleDeg: number;
  rStart: number; // outer foot (Y = 0)
  rEnd: number; // inner top (Y = 3)
  halfWidth: number;
  yStart: number;
  yEnd: number;
}

export interface NightMapDef {
  night: NightNumber;
  name: string;
  introQuote: string;
  durationS: number;
  playerSpawn: Vec3;
  lanterns: { id: string; pos: Vec3 }[];
  moteSpawnPoints: Vec3[];
  shadeSpawnPoints: Vec3[];
  shadeSpawnIntervalTicks: number;
  maxShades: number;
  shadeSpeed: number;
  hasDrifters: boolean;
  hasWind: boolean;
  charms: { id: string; pos: Vec3 }[];
  launchpads: LaunchpadDef[];
  ramps: RampDef[];
  getSurfaceY(x: number, z: number): number | null;
  isObstacle(x: number, z: number, y: number): boolean;
  resolveMove(oldPos: Vec3, newX: number, newZ: number, allowStepOffVoid?: boolean): {
    x: number;
    z: number;
    blocked: boolean;
  };
}

function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function polarXZ(cx: number, cz: number, radius: number, deg: number, y = 0): Vec3 {
  const rad = (deg * Math.PI) / 180;
  return [round3(cx + Math.cos(rad) * radius), y, round3(cz + Math.sin(rad) * radius)];
}

function makeRing(cx: number, cz: number, radius: number, count: number, startDeg = 0, stepDeg?: number, y = 0): Vec3[] {
  const step = stepDeg ?? 360 / count;
  const pts: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    pts.push(polarXZ(cx, cz, radius, startDeg + i * step, y));
  }
  return pts;
}

const STEP_UP_LIMIT = 0.48;

function resolveStandardMove(
  map: Pick<NightMapDef, 'getSurfaceY' | 'isObstacle'>,
  oldPos: Vec3,
  newX: number,
  newZ: number,
  allowStepOffVoid: boolean,
): { x: number; z: number; blocked: boolean } {
  const canOccupy = (tx: number, tz: number): boolean => {
    if (map.isObstacle(tx, tz, oldPos[1])) return false;
    const h = map.getSurfaceY(tx, tz);
    if (h === null) return allowStepOffVoid;
    return h <= oldPos[1] + STEP_UP_LIMIT;
  };

  if (canOccupy(newX, newZ)) {
    return { x: newX, z: newZ, blocked: false };
  }
  if (canOccupy(newX, oldPos[2])) {
    return { x: newX, z: oldPos[2], blocked: true };
  }
  if (canOccupy(oldPos[0], newZ)) {
    return { x: oldPos[0], z: newZ, blocked: true };
  }
  return { x: oldPos[0], z: oldPos[2], blocked: true };
}

function createNight1Map(): NightMapDef {
  const moteSpawnPoints: Vec3[] = [
    ...makeRing(0, 0, 12, 8, 0, 45, 0),
    ...makeRing(0, 0, 33, 16, 0, 22.5, 0),
  ];
  const shadeSpawnPoints = makeRing(0, 0, 37, 12, 15, 30, 0);

  const map: NightMapDef = {
    night: 1,
    name: 'Đêm 1 — Đảo Bến',
    introQuote:
      'Ông Đăng: "Mây ơi, sương đen đã phủ kín Đảo Bến rồi. Hãy gom đom đóm, thắp lại 5 Đèn Lồng Lớn trước khi bình minh tới nhé!"',
    durationS: TUNING.night1_duration_s,
    playerSpawn: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      { id: 'L2', pos: [23.8, 0, 7.7] },
      { id: 'L3', pos: [14.7, 0, -20.2] },
      { id: 'L4', pos: [-14.7, 0, -20.2] },
      { id: 'L5', pos: [-23.8, 0, 7.7] },
    ],
    moteSpawnPoints,
    shadeSpawnPoints,
    shadeSpawnIntervalTicks: 480, // 8s
    maxShades: 6,
    shadeSpeed: TUNING.shade_speed,
    hasDrifters: false,
    hasWind: false,
    charms: [],
    launchpads: [],
    ramps: [],
    getSurfaceY(x: number, z: number): number | null {
      return Math.hypot(x, z) <= 40 ? 0 : null;
    },
    isObstacle(): boolean {
      return false;
    },
    resolveMove(oldPos: Vec3, newX: number, newZ: number, allowStepOffVoid = true) {
      return resolveStandardMove(map, oldPos, newX, newZ, allowStepOffVoid);
    },
  };
  return map;
}

function createNight2Map(): NightMapDef {
  const moteSpawnPoints: Vec3[] = [
    ...makeRing(0, 0, 10, 4, 0, 90, 0),
    ...makeRing(0, 0, 22, 8, 0, 45, 0),
    ...makeRing(70, 0, 10, 4, 0, 90, 0),
    ...makeRing(70, 0, 22, 8, 0, 45, 0),
  ];
  const shadeSpawnPoints: Vec3[] = [
    ...makeRing(0, 0, 26, 8, 22.5, 45, 0),
    ...makeRing(70, 0, 26, 8, 22.5, 45, 0),
  ];

  // Launchpad 1: (20, 0, 18) -> Island B center (70, 0, 0), horizontal speed 24 m/s, vy 14 m/s
  const d1x = 70 - 20;
  const d1z = 0 - 18;
  const len1 = Math.hypot(d1x, d1z);
  // Launchpad 2: (50, 0, -18) -> Island A center (0, 0, 0), horizontal speed 24 m/s, vy 14 m/s
  const d2x = 0 - 50;
  const d2z = 0 - -18;
  const len2 = Math.hypot(d2x, d2z);

  const map: NightMapDef = {
    night: 2,
    name: 'Đêm 2 — Đảo Cau',
    introQuote:
      'Ông Đăng: "Đảo Cau có hai bờ nối bằng cầu tre hẹp và hai bục gió. Coi chừng Gió Lạc tinh nghịch thích cướp đom đóm đấy!"',
    durationS: TUNING.night2_duration_s,
    playerSpawn: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20] },
      { id: 'L2', pos: [17, 0, -10] },
      { id: 'L3', pos: [-17, 0, -10] },
      { id: 'L4', pos: [70, 0, 20] },
      { id: 'L5', pos: [87, 0, -10] },
      { id: 'L6', pos: [53, 0, -10] },
    ],
    moteSpawnPoints,
    shadeSpawnPoints,
    shadeSpawnIntervalTicks: 420, // 7s
    maxShades: 8,
    shadeSpeed: TUNING.shade_speed,
    hasDrifters: true,
    hasWind: false,
    charms: [{ id: 'C1', pos: [35, 0, 0] }],
    launchpads: [
      {
        pos: [20, 0, 18],
        radius: 1.0,
        vy: 14,
        vx: (d1x / len1) * 24,
        vz: (d1z / len1) * 24,
      },
      {
        pos: [50, 0, -18],
        radius: 1.0,
        vy: 14,
        vx: (d2x / len2) * 24,
        vz: (d2z / len2) * 24,
      },
    ],
    ramps: [],
    getSurfaceY(x: number, z: number): number | null {
      if (Math.hypot(x, z) <= 28) return 0;
      if (Math.hypot(x - 70, z) <= 28) return 0;
      if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
      return null;
    },
    isObstacle(): boolean {
      return false;
    },
    resolveMove(oldPos: Vec3, newX: number, newZ: number, allowStepOffVoid = true) {
      return resolveStandardMove(map, oldPos, newX, newZ, allowStepOffVoid);
    },
  };
  return map;
}

function createNight3Map(): NightMapDef {
  const ramps: RampDef[] = [
    { angleDeg: 30, rStart: 30, rEnd: 24, halfWidth: 1.5, yStart: 0, yEnd: 3 },
    { angleDeg: 150, rStart: 30, rEnd: 24, halfWidth: 1.5, yStart: 0, yEnd: 3 },
  ];

  const moteSpawnPoints: Vec3[] = [
    ...makeRing(0, 0, 34, 18, 0, 20, 0),
    ...makeRing(0, 0, 18, 8, 20, 20, 3),
    ...makeRing(0, 0, 5, 4, 45, 90, 6),
  ];
  const shadeSpawnPoints = makeRing(0, 0, 43, 16, 0, 22.5, 0);

  const getRampHeight = (x: number, z: number): number | null => {
    for (const ramp of ramps) {
      const rad = (ramp.angleDeg * Math.PI) / 180;
      const urx = Math.cos(rad);
      const urz = Math.sin(rad);
      const upx = -urz;
      const upz = urx;
      const along = x * urx + z * urz;
      const perp = Math.abs(x * upx + z * upz);
      // Slight inner overlap (rEnd - 0.5) ensures smooth corner join onto Tier 1
      if (along >= ramp.rEnd - 0.5 && along <= ramp.rStart && perp <= ramp.halfWidth) {
        const t = Math.max(0, Math.min(1, (ramp.rStart - along) / (ramp.rStart - ramp.rEnd)));
        return ramp.yStart + t * (ramp.yEnd - ramp.yStart);
      }
    }
    return null;
  };

  const map: NightMapDef = {
    night: 3,
    name: 'Đêm 3 — Đảo Chuông',
    introQuote:
      'Ông Đăng: "Đêm cuối cùng trên Đảo Chuông ba tầng! Hãy nương theo gió mạnh, vượt hai con dốc và bục nhảy để thắp sáng ngọn đèn đỉnh tháp!"',
    durationS: TUNING.night3_duration_s,
    // Center (0,0) is occupied by Tier 2 plateau (r <= 8) and Bell Tower (r <= 2), so spawn on open Tier 0 facing +Z
    playerSpawn: [0, 0, -12],
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] },
    ],
    moteSpawnPoints,
    shadeSpawnPoints,
    shadeSpawnIntervalTicks: 360, // 6s
    maxShades: 10,
    shadeSpeed: SHADE_NIGHT3_SPEED,
    hasDrifters: true,
    hasWind: true,
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] },
    ],
    launchpads: [
      {
        pos: [0, 3, 13],
        radius: 1.0,
        vy: 12,
        vx: 0,
        vz: -8,
      },
    ],
    ramps,
    getSurfaceY(x: number, z: number): number | null {
      const r = Math.hypot(x, z);
      if (r > 45) return null;
      if (r <= 8) return 6;
      if (r >= 12 && r <= 24 && z > 0) return 3;
      const rampY = getRampHeight(x, z);
      if (rampY !== null) return rampY;
      return 0;
    },
    isObstacle(x: number, z: number): boolean {
      // Bell tower cylinder radius 2m at center of Tier 2 (impassable from any elevation)
      return Math.hypot(x, z) < 2.0;
    },
    resolveMove(oldPos: Vec3, newX: number, newZ: number, allowStepOffVoid = true) {
      return resolveStandardMove(map, oldPos, newX, newZ, allowStepOffVoid);
    },
  };
  return map;
}

export function getNightMap(night: NightNumber): NightMapDef {
  switch (night) {
    case 1:
      return createNight1Map();
    case 2:
      return createNight2Map();
    case 3:
      return createNight3Map();
  }
}
