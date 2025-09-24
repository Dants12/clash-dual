import type { DeterministicSampler } from './types.js';

// Плавная (экспо-подобная)
export function smoothMultiplier(t: number, speed = 1.0) {
  const k = 0.22 * speed;
  return Math.max(1, Math.exp(k * t));
}

// Скачущая, с шагами и джиттером
export function jumpyMultiplier(stepInput: number, sampler: DeterministicSampler) {
  const step = Math.max(0, Math.floor(stepInput)); // 4 шага/сек
  let m = 1.0;
  for (let i = 0; i < step; i++) {
    const base = 1 + sampler(i * 2) * 0.12; // 0–12% скачок
    const jitter = (sampler(i * 2 + 1) - 0.5) * 0.03; // ±3% джиттер
    m *= base + jitter;
  }
  return Math.max(1, m);
}
