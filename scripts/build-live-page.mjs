#!/usr/bin/env node
// Build the app into one self-contained HTML page for the claude.ai
// "working app" artifact: dist-live/crittersitter-live.html.
//
// The page has no Express server, so scripts/artifact-shim.js stands in for
// it (sitter codes go to the artifact's shared storage, file saves go through
// the viewer's save prompt). The PWA service worker is left out: artifact
// pages cannot register one. Run: npm run build:live
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'dist-live/.build');
rmSync(tmp, { recursive: true, force: true });

await build({
  configFile: false,
  root,
  base: './',
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': root } },
  build: {
    outDir: tmp,
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    copyPublicDir: false,
    rollupOptions: { output: { codeSplitting: false } },
  },
});

const assets = path.join(tmp, 'assets');
const pick = (ext) => readFileSync(path.join(assets, readdirSync(assets).find((f) => f.endsWith(ext))), 'utf8');
const js = pick('.js').replace(/<\/script/gi, '<\\/script');
const css = pick('.css');
if (/<\/style/i.test(css)) throw new Error('stylesheet contains </style');
const shim = readFileSync(path.join(root, 'scripts/artifact-shim.js'), 'utf8');

// The artifact host wraps this in its own <html>/<head>/<body>.
const page = `<title>CritterSitter</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root{color-scheme:dark}html,body{background:var(--cs-app-bg,#161616)}</style>
<style>${css}</style>
<div id="root"></div>
<script>${shim}</script>
<script type="module">${js}</script>
`;
mkdirSync(path.join(root, 'dist-live'), { recursive: true });
writeFileSync(path.join(root, 'dist-live/crittersitter-live.html'), page);
rmSync(tmp, { recursive: true, force: true });
console.log(`dist-live/crittersitter-live.html  ${Math.round(page.length / 1024)} KB`);
