#!/usr/bin/env node
// Export every app screen from the running dev server as an editable,
// playable design-canvas artboard (design/screens/Screen-*.dc.html).
//
// Colors are written as the app's named colors (var(--cs-*)), found exactly:
// each named color is swapped for a unique stand-in value while the page is
// read, so a computed color maps back to its name even when two names share
// a value. Navigation buttons become links between artboards so the canvas's
// Play mode clicks through the flow.
//
// Needs the dev server (npm run dev) and Playwright (preinstalled in cloud
// sessions; elsewhere `npm i -D playwright`). Run: npm run design:screens
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.APP_URL || 'http://localhost:3000';
const OUT = path.join(root, 'design/screens');
const TOKENS = JSON.parse(readFileSync(path.join(root, 'design/tokens.json'), 'utf8')).color.tokens.map((t) => t.name);

// ---- runs in the page --------------------------------------------------------
function serializeInPage(tokenNames) {
  // Stand-in colors: one unique value per named color.
  const rootEl = document.documentElement;
  const saved = tokenNames.map((n) => [n, rootEl.style.getPropertyValue(`--${n}`)]);
  // Color transitions would otherwise still show the real colors mid-fade.
  const noFade = document.createElement('style');
  noFade.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.appendChild(noFade);
  const probe = document.createElement('div');
  document.body.appendChild(probe);
  const exact = new Map();
  const labs = new Map();
  tokenNames.forEach((n, i) => {
    rootEl.style.setProperty(`--${n}`, `rgb(${10 + i}, 1, 3)`);
  });
  tokenNames.forEach((n) => {
    probe.style.color = `var(--${n})`;
    exact.set(getComputedStyle(probe).color, n);
    probe.style.color = `color-mix(in oklab, var(--${n}) 50%, transparent)`;
    const m = /^oklab\(([^/]+)\//.exec(getComputedStyle(probe).color);
    if (m) labs.set(m[1].trim(), n);
  });
  probe.remove();

  const named = (v) => {
    if (exact.has(v)) return `var(--${exact.get(v)})`;
    const m = /^oklab\(([^/]+)\/\s*([\d.]+)\)$/.exec(v);
    if (m && labs.has(m[1].trim())) return `color-mix(in oklab, var(--${labs.get(m[1].trim())}) ${Math.round(parseFloat(m[2]) * 100)}%, transparent)`;
    return v;
  };

  const PROPS = ['display','position','top','right','bottom','left','z-index','flex-direction','flex-wrap',
    'justify-content','align-items','align-self','align-content','flex-grow','flex-shrink','flex-basis',
    'row-gap','column-gap','grid-template-columns','grid-template-rows','grid-column','grid-row',
    'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left',
    'background-color','background-image','border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-top-style','border-right-style','border-bottom-style','border-left-style',
    'border-top-color','border-right-color','border-bottom-color','border-left-color',
    'border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius',
    'box-shadow','opacity','transform','overflow-x','overflow-y','object-fit','text-overflow'];
  const INHERITED = ['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing',
    'text-align','text-transform','white-space','text-decoration-line'];
  const COLOR = /(^|-)color$/;
  const DEFAULTS = new Set(['0px','none','normal','auto','rgba(0, 0, 0, 0)','static','visible','nowrap',
    'row','stretch','flex-start','start','currentcolor','clip','fill','0% 0%','']);
  // Properties whose default is a number: compare against their own default,
  // never a shared list (flex-grow: 1 is meaningful, opacity: 1 is not).
  const NUMERIC_DEFAULT = { 'flex-grow': '0', 'flex-shrink': '1', 'opacity': '1', 'z-index': 'auto' };
  const SIZE_RE = /(^|\s|:)(w-|h-|size-|min-w-|min-h-|aspect-|inset-|basis-)/;
  const FORM = new Set(['input', 'textarea', 'select', 'button']);
  const VOID = new Set(['input','img','br','hr']);
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\{\{/g,'{&#123;');
  const attr = (s) => esc(s).replace(/"/g,'&quot;');

  function styleFor(el, parentCS) {
    const cs = getComputedStyle(el);
    const out = [];
    for (const p of PROPS) {
      const v = cs.getPropertyValue(p);
      if (/^border-(top|right|bottom|left)-(style|color)$/.test(p)) {
        const side = p.split('-')[1];
        if (cs.getPropertyValue(`border-${side}-style`) === 'none' || cs.getPropertyValue(`border-${side}-width`) === '0px') continue;
      } else if (p in NUMERIC_DEFAULT ? v === NUMERIC_DEFAULT[p] : DEFAULTS.has(v)) continue;
      if (p === 'display' && v === 'block' && !['span','button','input','label','a','svg'].includes(el.tagName.toLowerCase())) continue;
      // Gradients name their stops too, so they follow the named colors.
      const val = COLOR.test(p) ? named(v)
        : p === 'background-image' ? v.replace(/(rgba?|oklab|oklch)\([^)]*\)/g, (c) => named(c)) : v;
      out.push(`${p}: ${val}`);
    }
    for (const p of INHERITED) {
      const v = cs.getPropertyValue(p);
      // Form controls do not inherit fonts by default outside the app's reset.
      if (!parentCS || parentCS.getPropertyValue(p) !== v || (FORM.has(el.tagName.toLowerCase()) && p.startsWith('font'))) out.push(`${p}: ${p === 'color' ? named(v) : v}`);
    }
    const cls = el.getAttribute('class') || '';
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    if (SIZE_RE.test(cls) || el.style.width || el.style.height || tag === 'input' || tag === 'textarea') {
      out.push(`width: ${Math.round(r.width * 10) / 10}px`, `height: ${Math.round(r.height * 10) / 10}px`);
    }
    if (/(^|\s)max-w-/.test(cls)) out.push(`max-width: ${cs.maxWidth}`);
    out.push('box-sizing: border-box');
    return out.join('; ');
  }

  function svgOut(el) {
    const tag = el.tagName.toLowerCase();
    const attrs = [...el.attributes].filter((a) => !['class','style'].includes(a.name)).map((a) => `${a.name}="${attr(a.value)}"`);
    if (tag === 'svg') {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      attrs.push(`style="width: ${Math.round(r.width)}px; height: ${Math.round(r.height)}px; color: ${named(cs.color)}; flex-shrink: 0; display: block"`);
      if (!el.hasAttribute('aria-hidden')) attrs.push('aria-hidden="true"');
    }
    return `<${tag} ${attrs.join(' ')}>${[...el.children].map(svgOut).join('')}</${tag}>`;
  }

  function walk(node, parentCS) {
    if (node.nodeType === 3) { const t = node.textContent; return t.trim() ? esc(t.replace(/\s+/g, ' ')) : (/\s/.test(t) ? ' ' : ''); }
    if (node.nodeType !== 1) return '';
    const el = node; let tag = el.tagName.toLowerCase();
    if (['script','style','link','template','noscript','video','canvas'].includes(tag)) return '';
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    if (tag === 'input' && el.type === 'file') return '';
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && tag !== 'br') return '';
    if (tag === 'svg') return svgOut(el);
    if (!['div','span','p','h1','h2','h3','h4','button','input','textarea','label','img','select','option','section','header','footer','main','nav','ul','li','strong','em','small','a','form','figure','br','hr'].includes(tag)) tag = 'div';
    if (tag === 'a') tag = 'span';
    if (tag === 'form') tag = 'div';
    const a = [`style="${attr(styleFor(el, parentCS))}"`];
    if (tag === 'button') a.unshift('type="button"');
    const al = el.getAttribute('aria-label'); if (al) a.push(`aria-label="${attr(al)}"`);
    if (tag === 'input') {
      a.push(`type="${attr(el.type || 'text')}"`);
      if (el.placeholder) a.push(`placeholder="${attr(el.placeholder)}"`);
      if (el.value) a.push(`value="${attr(el.value)}"`);
      if (el.type === 'checkbox' && el.checked) a.push('checked="checked"');
    }
    if (tag === 'textarea' && el.placeholder) a.push(`placeholder="${attr(el.placeholder)}"`);
    if (tag === 'img') a.push(`src="${attr(el.src)}"`, `alt="${attr(el.alt || '')}"`);
    if (VOID.has(tag)) return `<${tag} ${a.join(' ')}>`;
    let inner;
    if (tag === 'textarea') inner = esc(el.value || '');
    else if (tag === 'select') inner = [...el.options].map((o) => `<option${o.selected ? ' selected="selected"' : ''}>${esc(o.text)}</option>`).join('');
    else inner = [...el.childNodes].map((n) => walk(n, cs)).join('');
    return `<${tag} ${a.join(' ')}>${inner}</${tag}>`;
  }

  const appRoot = document.getElementById('root');
  const H = Math.max(document.documentElement.scrollHeight, 844);
  const bodyCS = getComputedStyle(document.body);
  const html = [...appRoot.childNodes].map((n) => walk(n, bodyCS)).join('');
  const bg = named(bodyCS.backgroundColor);
  saved.forEach(([n, v]) => (v ? rootEl.style.setProperty(`--${n}`, v) : rootEl.style.removeProperty(`--${n}`)));
  noFade.remove();
  return { H, html, bg };
}

// ---- navigation links (Play mode) -------------------------------------------
const FILE = { W: 'Welcome', C: 'EnterSitterCode', P: 'ThePaw', N: 'NamePhoto', PC: 'PetCards',
  V: 'VaccineWeight', L: 'LostPetFlyer', S: 'Share', SV: 'SitterView' };
const EXACT = { 'welcome': 'W', 'start screen': 'W', 'enter sitter code': 'C', 'the paw': 'P', 'pet name & picture': 'N',
  'pet cards': 'PC', 'vaccine & weight info': 'V', 'lost pet flyer': 'L', 'share': 'S', 'what the sitter sees': 'SV', 'open pet card': 'SV' };
const PREFIX = [["i'm an owner", 'P'], ["i'm a sitter", 'C'], ['add pet in slot', 'N'], ['vet visit', 'V'], ['lost pet flyer', 'L']];
const ARROWS = { W: [null, 'P'], C: ['W', 'SV'], P: ['W', 'N'], N: ['P', 'PC'], PC: ['N', 'S'], V: ['PC', 'S'], L: ['PC', 'S'], S: ['L', 'SV'], SV: ['S', null] };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function linkify(key, html) {
  return html.replace(/<button type="button" style="([^"]*)"((?: aria-label="[^"]*")?)>([\s\S]*?)<\/button>/g, (all, style, aria, inner) => {
    const label = decode(aria ? /aria-label="([^"]*)"/.exec(aria)[1] : inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().toLowerCase();
    let t = label === 'previous screen' ? ARROWS[key][0] : label === 'next screen' ? ARROWS[key][1] : EXACT[label];
    if (!t) t = (PREFIX.find(([p]) => label.startsWith(p)) || [])[1];
    if (!t || t === key) return all;
    const extra = '; text-decoration: none; cursor: pointer' + (/(^|[^\w-])color:/.test(style) ? '' : '; color: inherit');
    return `<a href="Screen-${FILE[t]}.dc.html" style="${style}${extra}"${aria}>${inner}</a>`;
  });
}

function artboard(title, s) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CritterSitter · ${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="ds/crittersitter/tokens.css">
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&amp;family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
a{color:var(--cs-accent)}a:hover{color:var(--cs-accent-hover)}
</style>
</helmet>
<div style="width: 390px; height: ${s.H}px; box-sizing: border-box; position: relative; overflow: hidden; background-color: ${s.bg}; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: var(--cs-ink)">
${s.html}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":${s.H}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;
}

// ---- drive the app through every screen --------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
const screens = [];
const grab = async (key, title) => {
  await page.waitForTimeout(1500);
  const s = await page.evaluate(serializeInPage, TOKENS);
  screens.push({ key, title, ...s });
  console.log(`Screen-${FILE[key]}.dc.html  ${s.H}px`);
};

await page.goto(URL); await page.waitForTimeout(1500);
await grab('W', 'Welcome');
await page.getByText("I'm a Sitter").click(); await grab('C', 'Enter sitter code');
await page.getByLabel('Previous screen').click(); await page.waitForTimeout(800);
await page.getByText("I'm an Owner").click(); await grab('P', 'The Paw');
await page.getByLabel('Add pet in slot 1').click(); await page.waitForTimeout(700);
await page.getByPlaceholder('Enter pet name').fill('Biscuit');
await page.getByPlaceholder('Enter pet name').blur();
await grab('N', 'Pet name & picture');
await page.getByLabel('Next screen').click(); await page.waitForTimeout(800);
await page.getByPlaceholder('Age').fill('4 yrs');
await page.getByPlaceholder('Breed').fill('Beagle mix');
await page.getByPlaceholder('Wt').fill('24');
await page.locator('textarea:visible').first().fill('1 cup dry kibble at 7am and 6pm. No chicken (allergic).');
await page.locator('body').click({ position: { x: 5, y: 5 } });
await grab('PC', 'Pet cards');
await page.getByRole('button', { name: /Vet visit/ }).click(); await grab('V', 'Vaccine & weight info');
await page.getByLabel('Previous screen').click(); await page.waitForTimeout(900);
await page.getByRole('button', { name: /Lost pet flyer/ }).click(); await grab('L', 'Lost pet flyer');
await page.getByRole('button', { name: 'Share', exact: true }).click(); await grab('S', 'Share');
await page.getByRole('button', { name: 'What the sitter sees' }).click(); await page.waitForTimeout(500);
await page.getByLabel('Expand Biscuit card').click().catch(() => {});
await grab('SV', 'What the sitter sees');
await browser.close();

mkdirSync(OUT, { recursive: true });
for (const s of screens) {
  writeFileSync(path.join(OUT, `Screen-${FILE[s.key]}.dc.html`), artboard(s.title, { ...s, html: linkify(s.key, s.html) }));
}
writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify(screens.map((s) => ({ file: `Screen-${FILE[s.key]}.dc.html`, title: s.title, height: s.H })), null, 2) + '\n');
console.log(`wrote ${screens.length} screens to design/screens/`);
