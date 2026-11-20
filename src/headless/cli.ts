#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDefaultInput, LanternIslandSim } from '../sim/engine.js';
import type { InputsFile, InputState, NightNumber, ScenarioConfig } from '../sim/types.js';
import {
  ContractFormatError,
  validateInputsFile,
  validateScenarioConfig,
} from './validation.js';

interface CliArgs {
  seed: number;
  night: NightNumber;
  ticks: number;
  out: string;
  snapshotEvery: number;
  scenarioPath?: string;
  inputsPath?: string;
}

function parseIntArg(flag: string, value: string | undefined): number {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`Invalid integer for ${flag}: ${value ?? '<missing>'}`);
  }
  return Number.parseInt(value, 10);
}

function requireStrArg(flag: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseCliArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let night: number | undefined;
  let ticks: number | undefined;
  let out: string | undefined;
  let snapshotEvery = 10;
  let scenarioPath: string | undefined;
  let inputsPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--seed':
        seed = parseIntArg('--seed', argv[++i]);
        break;
      case '--night':
        night = parseIntArg('--night', argv[++i]);
        break;
      case '--ticks':
        ticks = parseIntArg('--ticks', argv[++i]);
        break;
      case '--out':
        out = requireStrArg('--out', argv[++i]);
        break;
      case '--snapshot-every':
        snapshotEvery = parseIntArg('--snapshot-every', argv[++i]);
        break;
      case '--scenario':
        scenarioPath = requireStrArg('--scenario', argv[++i]);
        break;
      case '--inputs':
        inputsPath = requireStrArg('--inputs', argv[++i]);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (seed === undefined) throw new Error('Missing required argument: --seed');
  if (night === undefined) throw new Error('Missing required argument: --night');
  if (night !== 1 && night !== 2 && night !== 3) {
    throw new Error(`Unsupported --night value: ${night} (Contract v1.1 supports 1, 2, 3)`);
  }
  if (ticks === undefined || ticks < 0) {
    throw new Error('Missing or invalid required argument: --ticks (must be >= 0)');
  }
  if (!out) throw new Error('Missing required argument: --out');
  if (snapshotEvery < 1) {
    throw new Error('Invalid --snapshot-every value: must be >= 1');
  }

  return {
    seed,
    night,
    ticks,
    out,
    snapshotEvery,
    scenarioPath,
    inputsPath,
  };
}

function loadJsonFile(path: string, label: string): unknown {
  let rawText: string;
  try {
    rawText = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${path}": ${(err as Error).message}`);
  }
  try {
    return JSON.parse(rawText);
  } catch (err) {
    throw new ContractFormatError(
      `Invalid JSON in ${label} file "${path}": ${(err as Error).message}`,
    );
  }
}

function main(): void {
  let args: CliArgs;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Argument error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  let scenario: ScenarioConfig | undefined;
  let inputs: InputsFile | undefined;

  try {
    if (args.scenarioPath) {
      scenario = validateScenarioConfig(loadJsonFile(args.scenarioPath, 'scenario'));
    }
    if (args.inputsPath) {
      inputs = validateInputsFile(loadJsonFile(args.inputsPath, 'inputs'));
    }
  } catch (err) {
    if (err instanceof ContractFormatError) {
      process.stderr.write(`Format error: ${err.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`IO error: ${(err as Error).message}\n`);
    process.exit(1);
  }

  try {
    const sim = new LanternIslandSim({
      seed: args.seed,
      night: args.night,
      scenario,
    });

    const lines: string[] = [];
    lines.push(JSON.stringify(sim.getSnapshot()));

    const currentInput: InputState = createDefaultInput();
    const frames = inputs?.frames ?? [];
    let frameIdx = 0;

    for (let k = 0; k < args.ticks; k++) {
      while (frameIdx < frames.length && frames[frameIdx].tick <= k) {
        const frame = frames[frameIdx];
        if (frame.move !== undefined) currentInput.move = [frame.move[0], frame.move[1]];
        if (frame.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = frame.cam_yaw_deg;
        if (frame.jump !== undefined) currentInput.jump = frame.jump;
        if (frame.interact !== undefined) currentInput.interact = frame.interact;
        if (frame.pulse !== undefined) currentInput.pulse = frame.pulse;
        if (frame.dash !== undefined) currentInput.dash = frame.dash;
        if (frame.pause !== undefined) currentInput.pause = frame.pause;
        frameIdx += 1;
      }

      const events = sim.step(currentInput);
      for (const ev of events) {
        lines.push(JSON.stringify(ev));
      }

      if ((k + 1) % args.snapshotEvery === 0) {
        lines.push(JSON.stringify(sim.getSnapshot()));
      }

      if (sim.state === 'won' || sim.state === 'lost') {
        break;
      }
    }

    lines.push(JSON.stringify(sim.getEndRecord()));

    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${lines.join('\n')}\n`, 'utf8');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Simulation error: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main();
