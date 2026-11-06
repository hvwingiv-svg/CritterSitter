#!/usr/bin/env node
// Generate src/tokens.css from design/tokens.json, the single source of the
// app's named colors, fonts and radii (shared with the design system and
// the design canvas). Run: npm run tokens
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(path.join(root, 'design/tokens.json'), 'utf8'));
const firstTheme = tokens.color.themes[0].id;

const value = (t) => {
  const v = typeof t.value === 'string' ? t.value : t.value[firstTheme];
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? `var(--${alias[1]})` : v;
};

const lines = [
  '/* GENERATED from design/tokens.json by scripts/sync-tokens.mjs. Do not edit by hand. */',
  ':root {',
  ...tokens.color.tokens.map((t) => `  --${t.name}: ${value(t)};`),
  ...(tokens.radius?.tokens ?? []).map((t) => `  --${t.name}: ${t.value};`),
  ...Object.entries(tokens.type?.families ?? {}).map(([k, v]) => `  --cs-font-${k}: ${v};`),
  '}',
  '',
];
writeFileSync(path.join(root, 'src/tokens.css'), lines.join('\n'));
console.log(`src/tokens.css: ${tokens.color.tokens.length} colors`);
