// End-to-end check: node run.mjs [screenshot.png]   (URL=https://... to test a deployed copy, EDGE=path to a Chromium exe)
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'test', 'out');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const shot = path.resolve(process.argv[2] || path.join(outDir, 'app.png'));
const edge = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
let server, url = process.env.URL;
if (!url) {
  server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, rel === '/' ? 'index.html' : rel);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
}

const problems = [];
const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--disable-gpu', '--hide-scrollbars'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
page.on('pageerror', e => problems.push(`pageerror: ${e}`));
page.on('requestfailed', r => problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url()}`); });

const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir, eventsEnabled: true });
const downloadNames = new Map();
cdp.on('Browser.downloadWillBegin', e => downloadNames.set(e.guid, e.suggestedFilename));
function nextDownload() {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('download timed out')), 120000);
    cdp.on('Browser.downloadProgress', function h(e) {
      if (e.state === 'completed') { clearTimeout(t); cdp.off('Browser.downloadProgress', h); resolve(path.join(outDir, downloadNames.get(e.guid))); }
      if (e.state === 'canceled') { clearTimeout(t); reject(new Error('download canceled')); }
    });
  });
}

const summary = () => page.$eval('#summary', e => e.textContent);
const parseSummary = s => {
  const m = /= (\d+) (\w+) pages \((\w+)\)/.exec(s);
  if (!m) throw new Error(`unexpected summary: ${s}`);
  return { pages: +m[1], paper: m[2], orient: m[3] };
};

function checkPdf(downloaded, name, expectPages, [wIn, hIn]) {
  const file = path.join(outDir, name);
  fs.renameSync(downloaded, file);
  const s = fs.readFileSync(file, 'latin1');
  const pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [+m[3] - +m[1], +m[4] - +m[2]]);
  const jpegs = (s.match(/\/DCTDecode/g) || []).length;
  const bad = boxes.filter(([w, h]) => Math.abs(w - wIn * 72) > 0.2 || Math.abs(h - hIn * 72) > 0.2);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`${path.basename(file)}: ${pages} pages, ${jpegs} JPEG images, MediaBox ${boxes[0]?.join(' x ')} pt, ${kb} KB`);
  if (pages !== expectPages) problems.push(`${file}: expected ${expectPages} pages, found ${pages}`);
  if (boxes.length !== pages || bad.length) problems.push(`${file}: page size mismatch, want ${wIn * 72} x ${hIn * 72} pt, got ${JSON.stringify(bad.slice(0, 3))}`);
  if (jpegs !== pages) problems.push(`${file}: ${jpegs} JPEG images for ${pages} pages`);
}

await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
await page.goto(url, { waitUntil: 'networkidle0' });
if (!(await page.evaluate(() => !!window.jspdf?.jsPDF))) problems.push('jsPDF global missing after load');
if (!(await page.$eval('#download', b => b.disabled))) problems.push('Download enabled before an image was chosen');

const input = await page.$('#file');
await input.uploadFile(path.join(root, 'sample', 'sample.jpg'));
await page.waitForFunction(() => /dpi/.test(document.getElementById('summary').textContent));
await new Promise(r => setTimeout(r, 300));
const s1 = parseSummary(await summary());
console.log('defaults:', await summary());
if (s1.paper !== 'Letter' || s1.orient !== 'portrait' || s1.pages !== 8) problems.push(`defaults gave ${JSON.stringify(s1)}, expected 4 x 2 = 8 Letter portrait pages`);
fs.mkdirSync(path.dirname(shot), { recursive: true });
await page.evaluate(() => window.scrollTo(0, document.getElementById('settings').offsetTop - 12));
await page.screenshot({ path: shot });
console.log('screenshot:', shot);

let dl = nextDownload();
await page.click('#download');
checkPdf(await dl, 'letter-defaults.pdf', s1.pages + 1, s1.orient === 'portrait' ? [8.5, 11] : [11, 8.5]);

await page.select('#paper', 'a4');
await page.click('#unitCm + span');
await page.select('#orient', 'portrait');
await page.click('#width', { clickCount: 3 });
await page.type('#width', '60');
await page.click('#cover');
await page.click('#cutMarks');
await new Promise(r => setTimeout(r, 300));
const s2 = parseSummary(await summary());
console.log('A4/cm/portrait/60 cm:', await summary());
const heightCm = await page.$eval('#height', e => +e.value);
if (Math.abs(heightCm - 40) > 0.05) problems.push(`height should follow width by aspect ratio: got ${heightCm} cm, want 40`);
if (s2.paper !== 'A4' || s2.orient !== 'portrait') problems.push(`second run gave ${JSON.stringify(s2)}`);
dl = nextDownload();
await page.click('#download');
checkPdf(await dl, 'a4-portrait-60cm.pdf', s2.pages, [8.27, 11.69]);

await page.click('#sample');
await page.waitForFunction(() => /sample\.jpg/.test(document.getElementById('dropTitle').textContent));

await browser.close();
server?.close();
if (problems.length) { console.error('FAILED\n' + problems.join('\n')); process.exit(1); }
console.log('OK');
