import type { InputFrame, InputsFile, ScenarioConfig, ScenarioLantern, ScenarioShade, Vec3 } from '../sim/types.js';

export class ContractFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractFormatError';
  }
}

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

    for (const key of ['jump', 'interact', 'pulse', 'dash'] as const) {
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
    if (raw.player.carried !== undefined) {
      if (!isNonNegInt(raw.player.carried)) {
        throw new ContractFormatError('scenario.player.carried must be a non-negative integer');
      }
      out.player.carried = raw.player.carried;
    }
    if (raw.player.flames !== undefined) {
      if (!isNonNegInt(raw.player.flames)) {
        throw new ContractFormatError('scenario.player.flames must be a non-negative integer');
      }
      out.player.flames = raw.player.flames;
    }
  }

  if (raw.random_motes !== undefined) {
    if (typeof raw.random_motes !== 'boolean') {
      throw new ContractFormatError('scenario.random_motes must be a boolean');
    }
    out.random_motes = raw.random_motes;
  }

  if (raw.random_shades !== undefined) {
    if (typeof raw.random_shades !== 'boolean') {
      throw new ContractFormatError('scenario.random_shades must be a boolean');
    }
    out.random_shades = raw.random_shades;
  }

  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes)) {
      throw new ContractFormatError('scenario.motes must be an array');
    }
    out.motes = raw.motes.map((m, idx) => assertVec3(m, `scenario.motes[${idx}]`));
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
      if (s.id !== undefined) {
        if (typeof s.id !== 'string' || s.id.length === 0) {
          throw new ContractFormatError(`scenario.shades[${i}].id must be a non-empty string`);
        }
        if (seenShadeIds.has(s.id)) {
          throw new ContractFormatError(`Duplicate scenario.shades id: "${s.id}"`);
        }
        seenShadeIds.add(s.id);
      }
      const pos = assertVec3(s.pos, `scenario.shades[${i}].pos`);
      shades.push(s.id !== undefined ? { id: s.id, pos } : { pos });
    }
    out.shades = shades;
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
