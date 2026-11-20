import type {
  DrifterState,
  InputFrame,
  InputsFile,
  MoteKind,
  ScenarioCharm,
  ScenarioConfig,
  ScenarioDrifter,
  ScenarioLantern,
  ScenarioMote,
  ScenarioShade,
  ShadeState,
  Vec3,
} from '../sim/types.js';

export class ContractFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractFormatError';
  }
}

const VALID_SHADE_STATES = new Set<ShadeState>([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
]);

const VALID_DRIFTER_STATES = new Set<Exclude<DrifterState, 'removed'>>([
  'idle',
  'chase',
  'flee',
]);

const VALID_MOTE_KINDS = new Set<MoteKind>(['random', 'dropped']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function assertVec3(v: unknown, label: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isFiniteNumber)) {
    throw new ContractFormatError(`${label} must be an array of 3 finite numbers`);
  }
  return [v[0], v[1], v[2]];
}

export function validateInputsFile(raw: unknown): InputsFile {
  if (!isPlainObject(raw)) {
    throw new ContractFormatError('Inputs file root must be a JSON object');
  }
  if (!Array.isArray(raw.frames)) {
    throw new ContractFormatError('Inputs file must contain a "frames" array');
  }

  const frames: InputFrame[] = [];
  let prevTick = -1;

  for (let i = 0; i < raw.frames.length; i++) {
    const item = raw.frames[i];
    if (!isPlainObject(item)) {
      throw new ContractFormatError(`frames[${i}] must be an object`);
    }
    if (!isNonNegInt(item.tick)) {
      throw new ContractFormatError(`frames[${i}].tick must be a non-negative integer`);
    }
    if (item.tick <= prevTick) {
      throw new ContractFormatError(
        `frames[${i}].tick (${item.tick}) must be strictly greater than previous tick (${prevTick})`,
      );
    }
    prevTick = item.tick;

    const frame: InputFrame = { tick: item.tick };

    if (item.move !== undefined) {
      if (
        !Array.isArray(item.move) ||
        item.move.length !== 2 ||
        !isFiniteNumber(item.move[0]) ||
        !isFiniteNumber(item.move[1])
      ) {
        throw new ContractFormatError(`frames[${i}].move must be [x, z] finite numbers`);
      }
      if (item.move[0] < -1 || item.move[0] > 1 || item.move[1] < -1 || item.move[1] > 1) {
        throw new ContractFormatError(`frames[${i}].move components must be within [-1, 1]`);
      }
      frame.move = [item.move[0], item.move[1]];
    }

    if (item.cam_yaw_deg !== undefined) {
      if (!isFiniteNumber(item.cam_yaw_deg)) {
        throw new ContractFormatError(`frames[${i}].cam_yaw_deg must be a finite number`);
      }
      frame.cam_yaw_deg = item.cam_yaw_deg;
    }

    for (const key of ['jump', 'interact', 'pulse', 'dash', 'pause'] as const) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== 'boolean') {
          throw new ContractFormatError(`frames[${i}].${key} must be a boolean`);
        }
        frame[key] = item[key];
      }
    }

    frames.push(frame);
  }

  return { frames };
}

export function validateScenarioConfig(raw: unknown): ScenarioConfig {
  if (!isPlainObject(raw)) {
    throw new ContractFormatError('Scenario file root must be a JSON object');
  }

  const out: ScenarioConfig = {};

  if (raw.player !== undefined) {
    if (!isPlainObject(raw.player)) {
      throw new ContractFormatError('scenario.player must be an object');
    }
    out.player = {};
    if (raw.player.pos !== undefined) {
      out.player.pos = assertVec3(raw.player.pos, 'scenario.player.pos');
    }
    for (const key of [
      'carried',
      'flames',
      'invuln_ticks',
      'dash_cd_ticks',
      'pulse_cd_ticks',
      'charm_ticks',
    ] as const) {
      if (raw.player[key] !== undefined) {
        if (!isNonNegInt(raw.player[key])) {
          throw new ContractFormatError(`scenario.player.${key} must be a non-negative integer`);
        }
        out.player[key] = raw.player[key];
      }
    }
  }

  for (const key of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled'] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'boolean') {
        throw new ContractFormatError(`scenario.${key} must be a boolean`);
      }
      out[key] = raw[key];
    }
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractFormatError('scenario.motes must be an array');
    }
    const motes: ScenarioMote[] = [];
    const seenMoteIds = new Set<string>();
    for (let i = 0; i < raw.motes.length; i++) {
      const m = raw.motes[i];
      if (Array.isArray(m)) {
        motes.push(assertVec3(m, `scenario.motes[${i}]`));
      } else if (isPlainObject(m)) {
        const entry: Exclude<ScenarioMote, Vec3> = {
          pos: assertVec3(m.pos, `scenario.motes[${i}].pos`),
        };
        if (m.id !== undefined) {
          if (typeof m.id !== 'string' || m.id.length === 0) {
            throw new ContractFormatError(`scenario.motes[${i}].id must be a non-empty string`);
          }
          if (seenMoteIds.has(m.id)) {
            throw new ContractFormatError(`Duplicate scenario.motes id: "${m.id}"`);
          }
          seenMoteIds.add(m.id);
          entry.id = m.id;
        }
        if (m.kind !== undefined) {
          if (typeof m.kind !== 'string' || !VALID_MOTE_KINDS.has(m.kind as MoteKind)) {
            throw new ContractFormatError(`scenario.motes[${i}].kind must be "random" or "dropped"`);
          }
          entry.kind = m.kind as MoteKind;
        }
        if (m.ttl_s !== undefined) {
          if (m.ttl_s !== null && (!isFiniteNumber(m.ttl_s) || m.ttl_s < 0)) {
            throw new ContractFormatError(`scenario.motes[${i}].ttl_s must be null or >= 0`);
          }
          entry.ttl_s = m.ttl_s;
        }
        if (m.ttl_ticks !== undefined) {
          if (m.ttl_ticks !== null && !isNonNegInt(m.ttl_ticks)) {
            throw new ContractFormatError(`scenario.motes[${i}].ttl_ticks must be null or non-negative integer`);
          }
          entry.ttl_ticks = m.ttl_ticks;
        }
        motes.push(entry);
      } else {
        throw new ContractFormatError(`scenario.motes[${i}] must be [x,y,z] or object`);
      }
    }
    out.motes = motes;
  }

  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades)) {
      throw new ContractFormatError('scenario.shades must be an array');
    }
    const shades: ScenarioShade[] = [];
    const seenShadeIds = new Set<string>();
    for (let i = 0; i < raw.shades.length; i++) {
      const s = raw.shades[i];
      if (!isPlainObject(s)) {
        throw new ContractFormatError(`scenario.shades[${i}] must be an object`);
      }
      const entry: ScenarioShade = {
        pos: assertVec3(s.pos, `scenario.shades[${i}].pos`),
      };
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || s.id.length === 0) {
          throw new ContractFormatError(`scenario.shades[${i}].id must be a non-empty string`);
        }
        if (seenShadeIds.has(s.id)) {
          throw new ContractFormatError(`Duplicate scenario.shades id: "${s.id}"`);
        }
        seenShadeIds.add(s.id);
        entry.id = s.id;
      }
      if (s.state !== undefined) {
        if (typeof s.state !== 'string' || !VALID_SHADE_STATES.has(s.state as ShadeState)) {
          throw new ContractFormatError(
            `scenario.shades[${i}].state must be one of spawning, wander, chase, recoil, stunned`,
          );
        }
        entry.state = s.state as ShadeState;
      }
      if (s.state_ticks_left !== undefined) {
        if (!isNonNegInt(s.state_ticks_left)) {
          throw new ContractFormatError(
            `scenario.shades[${i}].state_ticks_left must be a non-negative integer`,
          );
        }
        entry.state_ticks_left = s.state_ticks_left;
      }
      shades.push(entry);
    }
    out.shades = shades;
  }

  if (raw.drifters !== undefined) {
    if (!Array.isArray(raw.drifters)) {
      throw new ContractFormatError('scenario.drifters must be an array');
    }
    const drifters: ScenarioDrifter[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < raw.drifters.length; i++) {
      const d = raw.drifters[i];
      if (!isPlainObject(d)) {
        throw new ContractFormatError(`scenario.drifters[${i}] must be an object`);
      }
      const entry: ScenarioDrifter = {
        pos: assertVec3(d.pos, `scenario.drifters[${i}].pos`),
      };
      if (d.id !== undefined) {
        if (typeof d.id !== 'string' || d.id.length === 0) {
          throw new ContractFormatError(`scenario.drifters[${i}].id must be a non-empty string`);
        }
        if (seenIds.has(d.id)) {
          throw new ContractFormatError(`Duplicate scenario.drifters id: "${d.id}"`);
        }
        seenIds.add(d.id);
        entry.id = d.id;
      }
      if (d.state !== undefined) {
        if (
          typeof d.state !== 'string' ||
          !VALID_DRIFTER_STATES.has(d.state as Exclude<DrifterState, 'removed'>)
        ) {
          throw new ContractFormatError(`scenario.drifters[${i}].state must be idle, chase, or flee`);
        }
        entry.state = d.state as Exclude<DrifterState, 'removed'>;
      }
      if (d.stolen !== undefined) {
        if (!isNonNegInt(d.stolen)) {
          throw new ContractFormatError(`scenario.drifters[${i}].stolen must be a non-negative integer`);
        }
        entry.stolen = d.stolen;
      }
      if (d.flee_ticks !== undefined) {
        if (!isNonNegInt(d.flee_ticks)) {
          throw new ContractFormatError(`scenario.drifters[${i}].flee_ticks must be a non-negative integer`);
        }
        entry.flee_ticks = d.flee_ticks;
      }
      drifters.push(entry);
    }
    out.drifters = drifters;
  }

  if (raw.charms !== undefined) {
    if (!Array.isArray(raw.charms)) {
      throw new ContractFormatError('scenario.charms must be an array');
    }
    const charms: ScenarioCharm[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < raw.charms.length; i++) {
      const c = raw.charms[i];
      if (!isPlainObject(c)) {
        throw new ContractFormatError(`scenario.charms[${i}] must be an object`);
      }
      if (typeof c.id !== 'string' || c.id.length === 0) {
        throw new ContractFormatError(`scenario.charms[${i}].id must be a non-empty string`);
      }
      if (seenIds.has(c.id)) {
        throw new ContractFormatError(`Duplicate scenario.charms id: "${c.id}"`);
      }
      seenIds.add(c.id);
      const entry: ScenarioCharm = { id: c.id };
      if (c.pos !== undefined) {
        entry.pos = assertVec3(c.pos, `scenario.charms[${i}].pos`);
      }
      if (c.available !== undefined) {
        if (typeof c.available !== 'boolean') {
          throw new ContractFormatError(`scenario.charms[${i}].available must be a boolean`);
        }
        entry.available = c.available;
      }
      if (c.respawn_s !== undefined) {
        if (!isFiniteNumber(c.respawn_s) || c.respawn_s < 0) {
          throw new ContractFormatError(`scenario.charms[${i}].respawn_s must be >= 0`);
        }
        entry.respawn_s = c.respawn_s;
      }
      if (c.respawn_ticks !== undefined) {
        if (!isNonNegInt(c.respawn_ticks)) {
          throw new ContractFormatError(`scenario.charms[${i}].respawn_ticks must be a non-negative integer`);
        }
        entry.respawn_ticks = c.respawn_ticks;
      }
      charms.push(entry);
    }
    out.charms = charms;
  }

  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns)) {
      throw new ContractFormatError('scenario.lanterns must be an array');
    }
    const lanterns: ScenarioLantern[] = [];
    for (let i = 0; i < raw.lanterns.length; i++) {
      const l = raw.lanterns[i];
      if (!isPlainObject(l)) {
        throw new ContractFormatError(`scenario.lanterns[${i}] must be an object`);
      }
      if (typeof l.id !== 'string' || l.id.length === 0) {
        throw new ContractFormatError(`scenario.lanterns[${i}].id must be a non-empty string`);
      }
      const entry: ScenarioLantern = { id: l.id };
      if (l.pos !== undefined) {
        entry.pos = assertVec3(l.pos, `scenario.lanterns[${i}].pos`);
      }
      if (l.deposited !== undefined) {
        if (!isNonNegInt(l.deposited)) {
          throw new ContractFormatError(
            `scenario.lanterns[${i}].deposited must be a non-negative integer`,
          );
        }
        entry.deposited = l.deposited;
      }
      if (l.lit !== undefined) {
        if (typeof l.lit !== 'boolean') {
          throw new ContractFormatError(`scenario.lanterns[${i}].lit must be a boolean`);
        }
        entry.lit = l.lit;
      }
      lanterns.push(entry);
    }
    out.lanterns = lanterns;
  }

  if (raw.time_left_s !== undefined) {
    if (!isFiniteNumber(raw.time_left_s) || raw.time_left_s < 0) {
      throw new ContractFormatError('scenario.time_left_s must be a non-negative finite number');
    }
    out.time_left_s = raw.time_left_s;
  }

  return out;
}
