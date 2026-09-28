#!/usr/bin/env node
// Punto de entrada que invoca el sidecar directo (docs/arch/002-reveron-desktop.md → Interfaces → Sidecar ↔ servidor Node).
import { parseArgs } from 'node:util';
import { startServer } from './start.mjs';

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    host: { type: 'string' },
  },
});

await startServer({ port: values.port, host: values.host, open: false });
