import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { DeterministicSampler } from './types.js';

const HMAC_PREFIX_BYTES = 13; // 52 bits -> 13 hex chars
const TWO_POW_52 = 2 ** 52;

export interface RoundConfig {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

export interface CrashRoundResult {
  targetA: number;
  targetB: number;
  hmacA: string;
  hmacB: string;
}

export interface DuelRoundResult {
  durationExtraMs: number;
  roll: number;
  hmacDuration: string;
  hmacRoll: string;
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacHex(key: string, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

export function randomSeed(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function uniformFromHmac(hmac: string): number {
  const slice = hmac.slice(0, HMAC_PREFIX_BYTES);
  const value = parseInt(slice, 16);
  return value / TWO_POW_52;
}

export interface CrashFromHmacOptions {
  edge?: number;
  min?: number;
  max?: number;
}

export function crashFromHmac(hmac: string, options: CrashFromHmacOptions = {}): number {
  const edge = typeof options.edge === 'number' ? options.edge : 0.03;
  const min = typeof options.min === 'number' ? options.min : 1.0;
  const max = typeof options.max === 'number' ? options.max : Number.POSITIVE_INFINITY;

  const value = parseInt(hmac.slice(0, HMAC_PREFIX_BYTES), 16);
  const clamped = Math.max(0, Math.min(TWO_POW_52 - 1, value));
  const inv = TWO_POW_52 / (TWO_POW_52 - clamped);
  const raw = 1 + (inv - 1) * (1 - edge);
  const rounded = Math.floor(raw * 100) / 100;
  return Math.max(min, Math.min(max, rounded));
}

export function roundCrash(config: RoundConfig): CrashRoundResult {
  const base = `${config.clientSeed}:${config.nonce}`;
  const hmacA = hmacHex(config.serverSeed, `${base}:A`);
  const hmacB = hmacHex(config.serverSeed, `${base}:B`);
  const targetA = crashFromHmac(hmacA, { edge: 0.04, min: 1.2, max: 250 });
  const targetB = crashFromHmac(hmacB, { edge: 0.015, min: 1.1, max: 400 });
  return { targetA, targetB, hmacA, hmacB };
}

export function crashBSampler(config: RoundConfig): DeterministicSampler {
  const base = `${config.clientSeed}:${config.nonce}:B`;
  return (index: number) => uniformFromHmac(hmacHex(config.serverSeed, `${base}:${index}`));
}

export function roundDuel(config: RoundConfig): DuelRoundResult {
  const base = `${config.clientSeed}:${config.nonce}`;
  const durationHmac = hmacHex(config.serverSeed, `${base}:duration`);
  const rollHmac = hmacHex(config.serverSeed, `${base}:roll`);
  const durationExtraMs = Math.floor(uniformFromHmac(durationHmac) * 4000);
  const roll = uniformFromHmac(rollHmac);
  return { durationExtraMs, roll, hmacDuration: durationHmac, hmacRoll: rollHmac };
}
