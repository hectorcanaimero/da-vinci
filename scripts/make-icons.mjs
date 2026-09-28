#!/usr/bin/env node
// Genera los íconos de la app (F7.1.T1) a partir del glifo "01 · Luz" del
// tablero de identidad (docs/layout.pen), extraído sin fondo a
// src-tauri/icons/glyph-source.png. Compone fondo propio (tinta) para todas
// las plataformas -- macOS solo necesita el cuadrado sin esquinas
// redondeadas a mano, el squircle lo aplica el sistema; Windows y Linux no
// tienen ese automasking, así que el fondo compuesto acá es el que ven.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
const SOURCE_GLYPH = join(ICONS_DIR, 'glyph-source.png');

const BG = '#12110e'; // tokens.css --bg-app (tinta)
const GLYPH_RATIO = 79 / 128; // regla del tablero: "el glifo ocupa el 62% del lienzo"

function magick(args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

function composite(size, outPath) {
  const glyphSize = Math.round(size * GLYPH_RATIO);
  magick([
    '-size', `${size}x${size}`, `xc:${BG}`,
    '(', SOURCE_GLYPH, '-resize', `${glyphSize}x${glyphSize}`, ')',
    // El prefijo PNG32: fuerza colorType 6. Sin el, ImageMagick escribe RGB
    // cuando la imagen sale totalmente opaca y `tauri::generate_context!`
    // aborta con "icon ... is not RGBA".
    '-gravity', 'center', '-composite', `PNG32:${outPath}`,
  ]);
}

function pixelAt(path, x, y) {
  return execFileSync('magick', [path, '-format', `%[pixel:p{${x},${y}}]`, 'info:']).toString().trim();
}

// Master + set de PNG para Linux/empaquetado y para los nombres que Tauri espera.
const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
for (const size of PNG_SIZES) composite(size, join(ICONS_DIR, `${size}x${size}.png`));
copyFileSync(join(ICONS_DIR, '1024x1024.png'), join(ICONS_DIR, 'icon.png'));
copyFileSync(join(ICONS_DIR, '256x256.png'), join(ICONS_DIR, '128x128@2x.png'));

// .ico multi-resolución para Windows.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const icoFrames = ICO_SIZES.map((size) => {
  const p = join(ICONS_DIR, `ico-${size}.png`);
  composite(size, p);
  return p;
});
magick([...icoFrames, join(ICONS_DIR, 'icon.ico')]);
for (const f of icoFrames) rmSync(f);

// .icns para macOS (requiere iconutil, solo disponible en macOS).
if (process.platform === 'darwin') {
  const iconset = join(ICONS_DIR, 'icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset);
  const ICNS_SIZES = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, size] of ICNS_SIZES) composite(size, join(iconset, name));
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ICONS_DIR, 'icon.icns')], { stdio: 'inherit' });
  rmSync(iconset, { recursive: true, force: true });
} else {
  console.warn('icon.icns: omitido, iconutil solo corre en macOS. Regenerar en Mac antes de publicar.');
}

// ponytail: chequeo mínimo -- a 16px el centro (disco) tiene que distinguirse del fondo.
const center = pixelAt(join(ICONS_DIR, '16x16.png'), 8, 8);
const corner = pixelAt(join(ICONS_DIR, '16x16.png'), 1, 1);
if (center === corner) {
  throw new Error(`Ícono ilegible a 16px: centro y esquina son el mismo color (${center})`);
}
console.log(`16px legible: centro=${center} fondo=${corner}`);
console.log('Íconos generados en', ICONS_DIR);
