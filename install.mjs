#!/usr/bin/env node
/**
 * Da Vinci — Cross-platform install script.
 *
 * What it does:
 *   1. Verifies Node.js >= 18
 *   2. Creates ~/.config/da-vinci/ directory
 *   3. Copies .env.example to ~/.config/da-vinci/.env (if not exists)
 *   4. Sets chmod 600 on the .env file
 *   5. Optionally symlinks this repo into ~/.claude/skills/da-vinci/
 *   6. Runs a smoke test to verify everything works
 *
 * Usage:
 *   node install.mjs           # interactive
 *   node install.mjs --yes     # non-interactive (accept all defaults)
 *   node install.mjs --skip-symlink
 */

import { existsSync, mkdirSync, copyFileSync, chmodSync, symlinkSync, readlinkSync, unlinkSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(homedir(), '.config', 'da-vinci');
const CONFIG_FILE = join(CONFIG_DIR, '.env');
const ENV_EXAMPLE = join(REPO_ROOT, '.env.example');
const SKILL_TARGET = join(homedir(), '.claude', 'skills', 'da-vinci');

const args = new Set(process.argv.slice(2));
const NON_INTERACTIVE = args.has('--yes') || args.has('-y');
const SKIP_SYMLINK = args.has('--skip-symlink');

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
};

const banner = `
${c.cyan}${c.bold}
    ██████╗  █████╗     ██╗   ██╗██╗███╗   ██╗ ██████╗██╗
    ██╔══██╗██╔══██╗    ██║   ██║██║████╗  ██║██╔════╝██║
    ██║  ██║███████║    ██║   ██║██║██╔██╗ ██║██║     ██║
    ██║  ██║██╔══██║    ╚██╗ ██╔╝██║██║╚██╗██║██║     ██║
    ██████╔╝██║  ██║     ╚████╔╝ ██║██║ ╚████║╚██████╗██║
    ╚═════╝ ╚═╝  ╚═╝      ╚═══╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝
${c.reset}${c.dim}    Visual generation skill for Claude Code${c.reset}
`;

async function main() {
  console.log(banner);

  step(1, 'Checking Node.js version');
  checkNode();

  step(2, 'Creating config directory');
  ensureConfigDir();

  step(3, 'Setting up .env file');
  await setupEnvFile();

  step(4, 'Setting up Claude Code skill link');
  await setupSkillLink();

  step(5, 'Running smoke test');
  runSmokeTest();

  console.log(`\n${c.green}${c.bold}✅  Da Vinci is ready!${c.reset}\n`);
  console.log(`${c.dim}Next steps:${c.reset}`);
  console.log(`  1. Edit ${c.cyan}${CONFIG_FILE}${c.reset} and add your API keys`);
  console.log(`  2. Try a generation:`);
  console.log(`     ${c.dim}$${c.reset} ${c.bold}node ${REPO_ROOT}/src/generate.mjs image --provider fal --model flux-schnell --prompt "a cute cat" --dry-run${c.reset}`);
  console.log(`  3. Or invoke via Claude Code: ${c.dim}"Da Vinci, generate a hero image for..."${c.reset}\n`);
}

function step(n, msg) {
  console.log(`${c.cyan}${c.bold}[${n}/5]${c.reset} ${msg}...`);
}

function checkNode() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    fail(`Node.js 18 or higher is required. You have v${process.versions.node}.`);
  }
  console.log(`     ${c.green}✓${c.reset} Node.js v${process.versions.node}`);
}

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    console.log(`     ${c.green}✓${c.reset} Created ${c.dim}${CONFIG_DIR}${c.reset}`);
  } else {
    console.log(`     ${c.green}✓${c.reset} ${c.dim}${CONFIG_DIR}${c.reset} already exists`);
  }
}

async function setupEnvFile() {
  if (existsSync(CONFIG_FILE)) {
    console.log(`     ${c.yellow}!${c.reset} ${c.dim}${CONFIG_FILE}${c.reset} already exists — skipping`);
    return;
  }
  if (!existsSync(ENV_EXAMPLE)) {
    fail(`Cannot find .env.example at ${ENV_EXAMPLE}`);
  }
  copyFileSync(ENV_EXAMPLE, CONFIG_FILE);
  if (platform() !== 'win32') {
    chmodSync(CONFIG_FILE, 0o600);
  }
  console.log(`     ${c.green}✓${c.reset} Copied .env template to ${c.dim}${CONFIG_FILE}${c.reset} (chmod 600)`);
}

async function setupSkillLink() {
  if (SKIP_SYMLINK) {
    console.log(`     ${c.dim}✗ Skipped (--skip-symlink)${c.reset}`);
    return;
  }

  const parentDir = dirname(SKILL_TARGET);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }

  if (existsSync(SKILL_TARGET)) {
    try {
      const linkTarget = readlinkSync(SKILL_TARGET);
      if (resolve(parentDir, linkTarget) === resolve(REPO_ROOT)) {
        console.log(`     ${c.green}✓${c.reset} Symlink already exists and points here`);
        return;
      }
    } catch {
      // not a symlink, real dir
    }
    const proceed = await confirm(
      `${c.yellow}!${c.reset} ${SKILL_TARGET} exists. Overwrite with a symlink to this repo?`,
      false
    );
    if (!proceed) {
      console.log(`     ${c.dim}✗ Skipped user chose to keep existing${c.reset}`);
      return;
    }
    try { unlinkSync(SKILL_TARGET); } catch {}
  }

  try {
    symlinkSync(REPO_ROOT, SKILL_TARGET, 'dir');
    console.log(`     ${c.green}✓${c.reset} Linked ${c.dim}${SKILL_TARGET}${c.reset} → this repo`);
  } catch (err) {
    console.log(`     ${c.yellow}!${c.reset} Could not create symlink: ${err.message}`);
    console.log(`     ${c.dim}You can manually copy this folder to ${SKILL_TARGET}${c.reset}`);
  }
}

function runSmokeTest() {
  const result = spawnSync(process.execPath, [
    join(REPO_ROOT, 'src', 'generate.mjs'),
    'image',
    '--provider', 'fal',
    '--model', 'flux-schnell',
    '--prompt', 'test',
    '--dry-run',
  ], { encoding: 'utf8' });

  if (result.status === 0) {
    console.log(`     ${c.green}✓${c.reset} Smoke test passed`);
  } else if (result.stderr?.includes('no encontré credenciales configuradas') || result.stderr?.includes('faltan variables')) {
    console.log(`     ${c.yellow}!${c.reset} Smoke test skipped — no API keys configured yet (that's OK!)`);
  } else {
    console.log(`     ${c.yellow}!${c.reset} Smoke test warning:`);
    console.log(`${c.dim}${result.stderr?.slice(0, 500)}${c.reset}`);
  }
}

async function confirm(question, defaultYes = true) {
  if (NON_INTERACTIVE) return defaultYes;
  const rl = createInterface({ input, output });
  try {
    const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await rl.question(question + suffix)).trim().toLowerCase();
    if (!answer) return defaultYes;
    return answer === 'y' || answer === 'yes' || answer === 's' || answer === 'si';
  } finally {
    rl.close();
  }
}

function fail(msg) {
  console.error(`\n${c.red}${c.bold}✗ ${msg}${c.reset}\n`);
  process.exit(1);
}

main().catch((err) => {
  fail(err.message);
});
