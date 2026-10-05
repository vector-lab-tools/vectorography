// README screenshots for vectorography. One headless Chrome, many shots.
// node shots.js <baseUrl> <outDir> [onlyNameSubstring]
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || path.join(process.env.HOME, 'Projects/vectorography/docs/images');
const ONLY = process.argv[4] || '';
const SCALE = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Settings the app keeps in localStorage. Each shot states only what it changes.
const base = {
  'vg.tab': 'atlas', 'vg.depth': 'handles', 'vg.ball': '1',
  'vg.topsplit': '0.7', 'vg.specimen': '168', 'vg.split': '0.4',
  'vg.guideink': '0.45',
};


// Injected into the page: finding things by what they say, because the app
// labels its controls for the reader rather than for a script.
const HELPERS = `
  window.__vg = {
    hit(sel, text) {
      const want = text.toLowerCase();
      for (const el of document.querySelectorAll(sel)) {
        if ((el.textContent || '').trim().toLowerCase().startsWith(want)) return el;
      }
      return null;
    },
    click(sel, text) {
      const el = this.hit(sel, text); if (!el) return 'missing: ' + text;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
      el.click(); return 'ok';
    },
    walk(n) {
      const r = [...document.querySelectorAll('button[title^="Walk"]')];
      if (!r.length) return 'no rose';
      r[n % r.length].click(); return 'ok';
    },
    type(sel, value) {
      const el = document.querySelector(sel); if (!el) return 'missing ' + sel;
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value').set;
      set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    },
  }; 1
`;

const SHOTS = [
  { name: 'navigator', w: 1440, h: 900, keep: {} },
  { name: 'specimen', w: 1440, h: 900, keep: { 'vg.specimen': '400', 'vg.topsplit': '1.4', 'vg.straight': '0.006' } },
  { name: 'perspective', w: 1440, h: 900, keep: { 'vg.depth': 'perspective', 'vg.specimen': '360', 'vg.topsplit': '1.2' } },
  { name: 'atlas', w: 1440, h: 900, keep: { 'vg.specimen': '110', 'vg.topsplit': '1.0' }, walk: 5 },
  { name: 'trail', w: 1440, h: 900, keep: {}, walk: 7 },
  { name: 'edit-menu', w: 1440, h: 900, keep: {}, walk: 3,
    act: ["__vg.click('button', 'Edit')"] },
  { name: 'export', w: 1440, h: 900, keep: {}, walk: 3,
    act: ['__vg.type(\'input[placeholder="Unnamed"]\', "Meridian")',
          "__vg.click('button', 'File')", "__vg.click('button', 'Export')"] },
  { name: 'settings', w: 1440, h: 900, keep: {},
    act: ["__vg.click('button', 'Edit')", "__vg.click('button', 'Settings')"] },
  { name: 'about', w: 1440, h: 900, keep: {},
    act: ["__vg.click('button', 'Help')", "__vg.click('button', 'About')"] },
  { name: 'mobile', w: 390, h: 844, keep: { 'vg.tab': 'atlas' }, mobile: true },
  { name: 'mobile-steer', w: 390, h: 844, keep: { 'vg.tab': 'steer' }, mobile: true },
  { name: 'mobile-trail', w: 390, h: 844, keep: { 'vg.tab': 'trail' }, mobile: true, walk: 6 },
];

const port = 9400 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=/tmp/vg-shots-prof-' + port,
  '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let ws, tries = 0;
  while (!ws && tries++ < 60) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch (e) { await sleep(200); }
  }
  if (!ws) { console.error('no chrome'); process.exit(1); }
  let id = 0; const pending = {};
  const send = (m, p) => new Promise((res) => {
    const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending[d.id]) { pending[d.id](d.result || d.error); delete pending[d.id]; return; }
    if (d.method === 'Runtime.exceptionThrown') {
      const e = d.params.exceptionDetails;
      console.log('  EXCEPTION:', (e.exception && e.exception.description || e.text || '').slice(0, 300));
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  await send('Runtime.enable'); await send('Page.enable');

  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) {
      console.log('  EVAL ERR:', (r.exceptionDetails.exception &&
        r.exceptionDetails.exception.description || '').slice(0, 300));
    }
    return r && r.result && r.result.value;
  };

  for (const s of SHOTS) {
    if (ONLY && !s.name.includes(ONLY)) continue;
    process.stdout.write('· ' + s.name);
    await send('Emulation.setDeviceMetricsOverride', {
      width: s.w, height: s.h, deviceScaleFactor: SCALE,
      mobile: !!s.mobile, screenWidth: s.w, screenHeight: s.h,
    });
    if (s.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    else await send('Emulation.setTouchEmulationEnabled', { enabled: false });

    // Settings have to be in place before the app reads them, so they are
    // written on the origin and the page is loaded again.
    await send('Page.navigate', { url: BASE });
    await sleep(1200);
    const keep = JSON.stringify(Object.assign({}, base, s.keep));
    await evalIn('(() => { const k = ' + keep +
      '; for (const [a, b] of Object.entries(k)) localStorage.setItem(a, b); return 1 })()');
    await send('Page.navigate', { url: BASE });

    // The space is fetched on load; nothing is worth photographing until the
    // specimen has outlines in it.
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      await sleep(500);
      ok = await evalIn('document.querySelectorAll("svg path").length > 4');
    }
    if (!ok) console.log(' (no outlines)');

    await evalIn(HELPERS);

    if (s.walk) {
      // Travel, so the trail and the journey have something in them. The rose
      // is what moves you, so it is what the script presses.
      for (let i = 0; i < s.walk; i++) {
        await evalIn(`window.__vg.walk(${i * 3 + 1})`);
        await sleep(700);
      }
      await sleep(1200);
    }

    for (const step of (s.act || [])) {
      const r = await evalIn('window.' + step);
      if (r !== 'ok') console.log('  ' + step + ' -> ' + r);
      await sleep(700);
    }

    await sleep(1200);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (shot && shot.data) {
      const f = path.join(OUT, s.name + '.png');
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('  ' + (fs.statSync(f).size / 1024).toFixed(0) + ' kB  ' + s.w * SCALE + '×' + s.h * SCALE);
    } else console.log('  FAILED');
  }
  ws.close(); chrome.kill('SIGKILL');
  process.exit(0);
})();
