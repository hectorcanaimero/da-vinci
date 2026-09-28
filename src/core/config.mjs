import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULTS = {
  port: 20130,
  host: '127.0.0.1',
  apiKey: null,
  concurrency: 3,
  // FR-29: intentos totales por trabajo (1 corrida + reintentos) antes de rendirse.
  maxAttempts: 4,
  // FR-32: tope de gasto del día, en USD. null = sin tope.
  dailyBudgetUsd: null,
  // Umbrales de costo de una generación, en USD (FR-17): por encima de `warn`
  // exige confirmación explícita; entre `auto` y `warn` sólo avisa.
  thresholds: { auto: 0.10, warn: 1.00 },
  fallback: true,
};

export const resolveHome = () => process.env.DAVINCI_HOME || join(homedir(), '.davinci');

function readFile(home) {
  try {
    return JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

const merge = (base, over) => ({
  ...base,
  ...over,
  thresholds: { ...base.thresholds, ...(over.thresholds ?? {}) },
});

export function loadConfig() {
  const home = resolveHome();
  return { home, ...merge(DEFAULTS, readFile(home)) };
}

export function saveConfig(patch) {
  const home = resolveHome();
  const next = merge(merge(DEFAULTS, readFile(home)), patch);
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify(next, null, 2) + '\n');
  return { home, ...next };
}
