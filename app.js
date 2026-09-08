'use strict';

const PAPER = { letter: [8.5, 11], a4: [8.27, 11.69], legal: [8.5, 14], tabloid: [11, 17] };
const PAPER_NAME = { letter: 'Letter', a4: 'A4', legal: 'Legal', tabloid: 'Tabloid' };
const CM = 2.54;
const MAX_PAGES = 200;
const MAX_SRC_PIXELS = 32e6; // ponytail: hard decode cap (~128 MB RGBA); posters over ~25 in wide lose a little source detail
const GRAY = '#5a5a5a', LIGHT = '#969696';

const $ = id => document.getElementById(id);
const ids = ['file', 'drop', 'dropTitle', 'sample', 'paper', 'orient', 'unitIn', 'unitCm', 'width', 'height', 'overlap',
  'margin', 'cutMarks', 'labels', 'cover', 'preview', 'previewWrap', 'summary', 'download', 'print', 'progress',
  'printPages', 'printStyle', 'settings'];
const el = Object.fromEntries(ids.map(id => [id, $(id)]));

const state = { img: null, name: '', aspect: 1.5, widthIn: 24, heightIn: 16, overlapIn: 0.25, marginIn: 0.3, unit: 'in' };

// ---------- units ----------
const toIn = v => state.unit === 'cm' ? v / CM : v;
const fromIn = v => state.unit === 'cm' ? v * CM : v;
const round2 = v => Math.round(v * 100) / 100;

function syncInputs(skip) {
  const cm = state.unit === 'cm';
  const set = (input, v) => { if (input !== skip) input.value = round2(fromIn(v)); };
  set(el.width, state.widthIn); set(el.height, state.heightIn); set(el.overlap, state.overlapIn); set(el.margin, state.marginIn);
  el.width.step = el.height.step = cm ? 1 : 0.5;
  el.overlap.step = el.margin.step = cm ? 0.1 : 0.05;
  document.querySelectorAll('.unit').forEach(s => s.textContent = `(${state.unit})`);
}

// ---------- layout (all geometry in inches) ----------
function makeLayout(pageW, pageH) {
  const { widthIn: W, heightIn: H, marginIn: margin, overlapIn: overlap } = state;
  const usableW = pageW - 2 * margin, usableH = pageH - 2 * margin;
  if (usableW <= overlap || usableH <= overlap) return null;
  const stepW = usableW - overlap, stepH = usableH - overlap;
  const cols = Math.max(1, Math.ceil((W - overlap) / stepW - 1e-9));
  const rows = Math.max(1, Math.ceil((H - overlap) / stepH - 1e-9));
  return { pageW, pageH, margin, overlap, usableW, usableH, stepW, stepH, cols, rows, pages: cols * rows };
}

function chooseLayout() {
  const [pw, ph] = PAPER[el.paper.value];
  const want = el.orient.value;
  const options = [];
  if (want !== 'landscape') options.push(['portrait', makeLayout(pw, ph)]);
  if (want !== 'portrait') options.push(['landscape', makeLayout(ph, pw)]);
  const valid = options.filter(o => o[1]);
  if (!valid.length) return null;
  valid.sort((a, b) => a[1].pages - b[1].pages || (a[0] === 'portrait' ? -1 : 1));
  return { orient: valid[0][0], lay: valid[0][1] };
}

function tileBox(lay, r, c) {
  const x0 = c * lay.stepW, y0 = r * lay.stepH;
  return [x0, y0, Math.min(x0 + lay.usableW, state.widthIn), Math.min(y0 + lay.usableH, state.heightIn)];
}

function cellBox(lay, r, c) {
  const x1 = c < lay.cols - 1 ? Math.min((c + 1) * lay.stepW, state.widthIn) : state.widthIn;
  const y1 = r < lay.rows - 1 ? Math.min((r + 1) * lay.stepH, state.heightIn) : state.heightIn;
  return [c * lay.stepW, r * lay.stepH, x1, y1];
}

const effDpi = () => state.img ? Math.min(state.img.width / state.widthIn, state.img.height / state.heightIn) : 0;
const pageDpi = () => Math.min(300, Math.max(150, Math.round(effDpi())));
const fmtIn = v => v.toFixed(1).replace(/\.0$/, '');
const sizeText = () => `${fmtIn(state.widthIn)} × ${fmtIn(state.heightIn)} in (${Math.round(state.widthIn * CM)} × ${Math.round(state.heightIn * CM)} cm)`;

// ---------- preview ----------
function renderPreview() {
  const c = el.preview, ctx = c.getContext('2d');
  const maxW = Math.max(200, el.previewWrap.clientWidth), maxH = Math.max(200, Math.min(440, window.innerHeight * 0.6));
  let cssW = maxW, cssH = cssW / state.aspect;
  if (cssH > maxH) { cssH = maxH; cssW = cssH * state.aspect; }
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr);
  c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (state.img) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.img, 0, 0, cssW, cssH);
  } else {
    ctx.fillStyle = '#c9d1dc'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#5f6b7a'; ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Your picture and its page grid appear here', cssW / 2, cssH / 2);
  }

  const choice = chooseLayout();
  if (!choice) return;
  const { lay } = choice;
  const s = cssW / state.widthIn;

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let k = 1; k < lay.cols; k++) ctx.fillRect(k * lay.stepW * s, 0, lay.overlap * s, cssH);
  for (let k = 1; k < lay.rows; k++) ctx.fillRect(0, k * lay.stepH * s, cssW, lay.overlap * s);

  ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  for (let k = 1; k < lay.cols; k++) { const x = k * lay.stepW * s; ctx.moveTo(x, 0); ctx.lineTo(x, cssH); }
  for (let k = 1; k < lay.rows; k++) { const y = k * lay.stepH * s; ctx.moveTo(0, y); ctx.lineTo(cssW, y); }
  ctx.stroke();
  ctx.setLineDash([]);

  const fontPx = Math.max(11, Math.min(22, Math.min(lay.stepW, lay.stepH) * s * 0.18));
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let r = 0; r < lay.rows; r++) for (let c2 = 0; c2 < lay.cols; c2++) {
    const [x0, y0, x1, y1] = cellBox(lay, r, c2);
    const cx = (x0 + x1) / 2 * s, cy = (y0 + y1) / 2 * s;
    const label = String(r * lay.cols + c2 + 1);
    const w = ctx.measureText(label).width + fontPx * 0.9, h = fontPx * 1.5;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4); ctx.fill();
    ctx.fillStyle = '#1c2430'; ctx.fillText(label, cx, cy + 1);
  }
}

function update(skip) {
  syncInputs(skip);
  renderPreview();
  const choice = chooseLayout();
  el.summary.classList.remove('warn');
  let ok = false;
  if (!choice) {
    el.summary.textContent = 'The margin and overlap leave no room on the page. Make them smaller.';
    el.summary.classList.add('warn');
  } else {
    const { orient, lay } = choice;
    let text = `${lay.cols} × ${lay.rows} = ${lay.pages} ${PAPER_NAME[el.paper.value]} pages (${orient}) · ${sizeText()}`;
    if (state.img) {
      const dpi = Math.round(effDpi());
      text += ` · about ${dpi} dpi`;
      if (dpi < 80) { text += ' — low: soft up close, fine from across the room'; el.summary.classList.add('warn'); }
      ok = true;
    } else {
      text += ' · choose a picture to continue';
    }
    if (lay.pages > MAX_PAGES) { text += ` — that is more than ${MAX_PAGES} pages; make the poster smaller`; el.summary.classList.add('warn'); ok = false; }
    el.summary.textContent = text;
  }
  el.download.disabled = el.print.disabled = !ok;
}

// ---------- page rendering (300 dpi units, scaled to the requested dpi) ----------
function preparePage(canvas, lay, dpi) {
  canvas.width = Math.round(lay.pageW * dpi);
  canvas.height = Math.round(lay.pageH * dpi);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpi / 300, 0, 0, dpi / 300, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lay.pageW * 300, lay.pageH * 300);
  ctx.imageSmoothingQuality = 'high';
  ctx.lineCap = 'butt';
  return ctx;
}
const px = inches => Math.round(inches * 300);

function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

function dashed(ctx, x0, y0, x1, y1, { width = 3, color = GRAY, halo = true } = {}) {
  if (halo) { ctx.strokeStyle = '#fff'; ctx.lineWidth = width + 4; ctx.setLineDash([]); line(ctx, x0, y0, x1, y1); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([20, 14]);
  line(ctx, x0, y0, x1, y1);
  ctx.setLineDash([]);
}

function renderTile(canvas, lay, r, c, dpi) {
  const ctx = preparePage(canvas, lay, dpi);
  const m = px(lay.margin);
  const [x0, y0, x1, y1] = tileBox(lay, r, c);
  const sx = state.img.width / state.widthIn, sy = state.img.height / state.heightIn;
  const cw = Math.max(1, px(x1 - x0)), ch = Math.max(1, px(y1 - y0));
  ctx.drawImage(state.img, x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, m, m, cw, ch);
  const right = m + cw, bottom = m + ch;
  const cutEdges = [];
  if (c > 0) cutEdges.push('left');
  if (r > 0) cutEdges.push('top');

  if (el.cutMarks.checked) {
    ctx.strokeStyle = GRAY; ctx.lineWidth = 3;
    const mark = px(0.18), gap = 6;
    for (const [cx, dx] of [[m, -1], [right, 1]]) for (const [cy, dy] of [[m, -1], [bottom, 1]]) {
      line(ctx, cx + dx * gap, cy, cx + dx * (gap + mark), cy);
      line(ctx, cx, cy + dy * gap, cx, cy + dy * (gap + mark));
    }
    if (c > 0) dashed(ctx, m, m, m, bottom);
    if (r > 0) dashed(ctx, m, m, right, m);

    const tick = Math.max(6, Math.floor(m / 2));
    ctx.strokeStyle = LIGHT; ctx.lineWidth = 3;
    if (c < lay.cols - 1) {
      const seamX = m + px(lay.stepW);
      line(ctx, seamX, m - tick, seamX, m - 2);
      line(ctx, seamX, bottom + 2, seamX, bottom + tick);
    }
    if (r < lay.rows - 1) {
      const seamY = m + px(lay.stepH);
      line(ctx, m - tick, seamY, m - 2, seamY);
      line(ctx, right + 2, seamY, right + tick, seamY);
    }
  }

  if (el.labels.checked) {
    const k = r * lay.cols + c + 1;
    let label = `page ${k}/${lay.pages}   row ${r + 1}, col ${c + 1}`;
    if (cutEdges.length) {
      const edges = `${cutEdges.join(' & ')} edge${cutEdges.length > 1 ? 's' : ''}`;
      label += el.cutMarks.checked ? `   cut dashed ${edges}, overlap onto neighbor` : `   trim white margin on ${edges}, overlap onto neighbor`;
    }
    ctx.fillStyle = GRAY; ctx.font = '33px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(label, m, bottom + Math.max(4, Math.floor((m - 33) / 2)));
  }
}

function renderCover(canvas, lay, orient, dpi) {
  const ctx = preparePage(canvas, lay, dpi);
  const BIG = 60, FONT = 33, m = px(0.75);
  let y = m;
  ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `600 ${BIG}px system-ui, sans-serif`;
  ctx.fillText('Print Big assembly sheet', m, y);
  y += Math.round(BIG * 1.6);

  const cut = el.cutMarks.checked ? 'cut along its dashed edge(s),' : 'trim its white margin on the left/top,';
  const lines = [
    `picture: ${state.name}`,
    `poster: ${sizeText()}`,
    `grid: ${lay.cols} across × ${lay.rows} down = ${lay.pages} ${PAPER_NAME[el.paper.value]} pages (${orient}), ${round2(lay.overlap)} in overlap, ~${Math.round(effDpi())} dpi`,
    '',
    '1. Print ALL pages at 100% / Actual size - never "Fit to page".',
    '2. Check the square below: it must measure exactly 1 inch (2.54 cm).',
    '3. Lay the pages out by row and column (map below).',
    `4. Page 1 stays whole. Every other page: ${cut}`,
    '   lay it over the neighboring page so the picture lines up, tape it.',
    '   Small margin ticks show where the next page\'s edge should land.',
  ];
  ctx.font = `${FONT}px system-ui, sans-serif`;
  for (const t of lines) { ctx.fillText(t, m, y); y += Math.round(FONT * 1.45); }

  y += Math.round(FONT * 0.8);
  const sq = px(1);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(m, y, sq, sq);
  ctx.textBaseline = 'middle';
  ctx.fillText('= 1 inch / 2.54 cm exactly', m + sq + px(0.2), y + sq / 2);
  y += sq + Math.round(FONT * 1.8);

  const boxW = px(lay.pageW) - 2 * m, boxH = px(lay.pageH) - m - y;
  const scale = Math.min(boxW / state.widthIn, boxH / state.heightIn);
  const tw = Math.max(1, Math.round(state.widthIn * scale)), th = Math.max(1, Math.round(state.heightIn * scale));
  const tx = Math.round((px(lay.pageW) - tw) / 2);
  ctx.drawImage(state.img, tx, y, tw, th);
  ctx.strokeRect(tx, y, tw, th);
  for (let k = 1; k < lay.cols; k++) { const gx = tx + Math.round(k * lay.stepW * scale); dashed(ctx, gx, y, gx, y + th, { width: 2, color: '#fff', halo: false }); }
  for (let k = 1; k < lay.rows; k++) { const gy = y + Math.round(k * lay.stepH * scale); dashed(ctx, tx, gy, tx + tw, gy, { width: 2, color: '#fff', halo: false }); }
  ctx.font = `600 ${BIG}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let r = 0; r < lay.rows; r++) for (let c = 0; c < lay.cols; c++) {
    const [x0, y0, x1, y1] = cellBox(lay, r, c);
    const nx = tx + Math.round((x0 + x1) / 2 * scale), ny = y + Math.round((y0 + y1) / 2 * scale);
    const num = String(r * lay.cols + c + 1);
    const w = ctx.measureText(num).width + 16, h = BIG + 8;
    ctx.fillStyle = '#fff'; ctx.fillRect(nx - w / 2, ny - h / 2, w, h);
    ctx.lineWidth = 2; ctx.strokeRect(nx - w / 2, ny - h / 2, w, h);
    ctx.fillStyle = '#000'; ctx.fillText(num, nx, ny + 2);
  }
}

// Renders every page in turn into one reused canvas; `emit` receives the finished canvas for each page.
async function renderAll(emit) {
  const { orient, lay } = chooseLayout();
  const dpi = pageDpi();
  const canvas = document.createElement('canvas');
  const jobs = [];
  if (el.cover.checked) jobs.push(() => renderCover(canvas, lay, orient, dpi));
  for (let r = 0; r < lay.rows; r++) for (let c = 0; c < lay.cols; c++) jobs.push(() => renderTile(canvas, lay, r, c, dpi));
  for (let i = 0; i < jobs.length; i++) {
    el.progress.textContent = `Rendering page ${i + 1} of ${jobs.length}…`;
    await new Promise(requestAnimationFrame);
    jobs[i]();
    await emit(canvas, i, lay);
  }
  return lay;
}

async function busy(fn) {
  el.download.disabled = el.print.disabled = true;
  try { await fn(); el.progress.textContent = ''; }
  catch (e) { console.error(e); el.progress.textContent = `Sorry, that failed: ${e.message || e}`; }
  finally { update(); }
}

function buildPdf() {
  if (!window.jspdf) throw new Error('the PDF library did not load; try the Print button instead');
  let doc;
  return renderAll((canvas, i, lay) => {
    const format = [lay.pageW, lay.pageH], orientation = lay.pageW > lay.pageH ? 'landscape' : 'portrait';
    if (i === 0) doc = new window.jspdf.jsPDF({ unit: 'in', format, orientation, compress: true });
    else doc.addPage(format, orientation);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, lay.pageW, lay.pageH);
  }).then(() => doc);
}

async function downloadPdf() {
  const doc = await buildPdf();
  doc.save(`${state.name.replace(/\.[^.]+$/, '') || 'poster'}_poster.pdf`);
}

async function printPages() {
  el.printPages.replaceChildren();
  const loads = [];
  const lay = await renderAll((canvas, i, l) => {
    const img = new Image();
    img.src = canvas.toDataURL('image/jpeg', 0.9);
    img.style.width = `${l.pageW}in`; img.style.height = `${l.pageH}in`;
    el.printPages.append(img);
    loads.push(img.decode());
  });
  el.printStyle.textContent = `@page { size: ${lay.pageW}in ${lay.pageH}in; margin: 0; }`;
  await Promise.all(loads);
  window.print();
}

// ---------- image loading ----------
async function loadFile(file) {
  if (!file) return;
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { el.summary.textContent = `Could not read "${file.name}" as an image.`; el.summary.classList.add('warn'); return; }
  const n = bmp.width * bmp.height;
  if (n > MAX_SRC_PIXELS) {
    const k = Math.sqrt(MAX_SRC_PIXELS / n);
    const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
    bmp.close(); bmp = small;
  }
  if (state.img) state.img.close();
  state.img = bmp; state.name = file.name; state.aspect = bmp.width / bmp.height;
  state.heightIn = state.widthIn / state.aspect;
  el.drop.classList.add('loaded');
  el.dropTitle.textContent = `${file.name} · ${bmp.width} × ${bmp.height} px · drop or tap to change`;
  update();
}

// ---------- events ----------
el.file.addEventListener('change', () => loadFile(el.file.files[0]));
el.drop.addEventListener('click', e => { if (e.target === el.drop) el.file.click(); });
['dragenter', 'dragover'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => el.drop.addEventListener(t, e => { e.preventDefault(); el.drop.classList.remove('over'); }));
el.drop.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
document.addEventListener('paste', e => { const f = [...e.clipboardData.files].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });
el.sample.addEventListener('click', async e => {
  e.preventDefault();
  const blob = await fetch('sample/sample.jpg').then(r => r.blob());
  loadFile(new File([blob], 'sample.jpg', { type: 'image/jpeg' }));
});

el.settings.addEventListener('input', e => {
  const t = e.target, v = parseFloat(t.value);
  if (t === el.width && v > 0) { state.widthIn = toIn(v); state.heightIn = state.widthIn / state.aspect; }
  else if (t === el.height && v > 0) { state.heightIn = toIn(v); state.widthIn = state.heightIn * state.aspect; }
  else if (t === el.overlap && v >= 0) state.overlapIn = toIn(v);
  else if (t === el.margin && v >= 0) state.marginIn = toIn(v);
  else if (t.name === 'unit') state.unit = t.value;
  else if (t.type === 'number') return;
  update(t);
});
el.download.addEventListener('click', () => busy(downloadPdf));
el.print.addEventListener('click', () => busy(printPages));
window.addEventListener('resize', () => requestAnimationFrame(renderPreview));

update();
