// Builds one LaTeX document of this repository in the cloud (TeXLive.net), so no TeX is installed locally.
//
//   node tools/texbuild.mjs <file.tex> [--engine xelatex|pdflatex|lualatex] [--with <file> ...]
//
// The PDF and the log land next to the .tex file. Only the .tex itself is sent, plus files named
// with --with (images and the like): the project folders hold many unrelated files.
// Engine: --engine, else "% !TEX program = ..." in the first 20 lines, else xelatex when the file
// loads fontspec or polyglossia, else pdflatex.
// Adapted from Documents/latex/tools/compile.mjs (same service, same request format).
// Afterwards check the log: grep -i -E "overfull|underfull|warning|^!" <name>.log

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const API = 'https://texlive.net/cgi-bin/latexcgi';
const ENGINES = ['pdflatex', 'xelatex', 'lualatex'];
const TEXT_EXT = new Set(['.tex', '.bib', '.bbl', '.sty', '.cls', '.bst', '.def', '.cfg', '.txt', '.csv', '.dat']);

// TeXLive.net expects paired filename[] and filecontents[] fields, including raw bytes for images.
function multipart(resources, engine, output) {
  const boundary = 'cloud-' + randomBytes(24).toString('hex');
  const parts = [];
  function field(name, value) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`));
    parts.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
    parts.push(Buffer.from('\r\n'));
  }
  for (const r of resources) {
    field('filename[]', r.main ? 'document.tex' : r.path);
    // The server turns CRLF into LF in every field, binary ones too; doubling CR keeps the bytes.
    const content = r.file
      ? Buffer.from(r.file.toString('latin1').replace(/\r\n/g, '\r\r\n'), 'latin1')
      : r.content;
    field('filecontents[]', content);
  }
  field('engine', engine);
  field('return', output);
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

function writeAtomic(file, buf) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, buf);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      if (attempt >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
}

async function main(argv) {
  const args = [...argv];
  let engine = null;
  const extra = [];
  let target = null;
  while (args.length) {
    const a = args.shift();
    if (a === '--engine') engine = args.shift();
    else if (a === '--with') extra.push(args.shift());
    else target = a;
  }
  if (!target || !target.endsWith('.tex') || !fs.existsSync(target)) {
    console.error('Использование: node tools/texbuild.mjs <файл.tex> [--engine xelatex] [--with <файл> ...]');
    return 1;
  }
  const main = path.resolve(target);
  const dir = path.dirname(main);
  const name = path.basename(main, '.tex');
  const src = fs.readFileSync(main, 'utf8');
  const head = src.split(/\r?\n/).slice(0, 20).join('\n');
  const declared = head.match(/^\s*%\s*!TeX\s+(?:TS-)?program\s*=\s*(\w+)/im)?.[1]?.toLowerCase();
  const unicode = /\\usepackage(?:\[[^\]]*\])?\{[^}]*\b(?:fontspec|polyglossia)\b[^}]*\}/.test(src);
  engine = (engine ?? declared ?? (unicode ? 'xelatex' : 'pdflatex')).toLowerCase();
  if (!ENGINES.includes(engine)) { console.error(`✗ неизвестный движок «${engine}»`); return 1; }

  const resources = [{ main: true, content: src }];
  for (const f of extra) {
    const full = path.resolve(dir, f);
    const p = path.relative(dir, full).split(path.sep).join('/');
    resources.push(TEXT_EXT.has(path.extname(full).toLowerCase())
      ? { path: p, content: fs.readFileSync(full, 'utf8') }
      : { path: p, file: fs.readFileSync(full) });
  }

  const started = Date.now();
  async function request(output) {
    const { body, boundary } = multipart(resources, engine, output);
    const response = await fetch(API, {
      method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body, signal: AbortSignal.timeout(180_000),
    });
    return { response, body: Buffer.from(await response.arrayBuffer()) };
  }
  let pdfRes, logRes;
  try { [pdfRes, logRes] = await Promise.all([request('pdf'), request('log')]); } catch (e) {
    console.error(`✗ сервер компиляции недоступен (${e.cause?.code ?? e.message}); PDF не обновлён`);
    return 1;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const logs = logRes.body.toString('utf8').replaceAll('document.tex', path.basename(main));
  fs.writeFileSync(path.join(dir, name + '.log'), logs);
  const ok = pdfRes.response.ok && /Output written on document\.pdf/.test(logRes.body.toString('utf8'))
    && pdfRes.body.subarray(0, 4).toString('latin1') === '%PDF';
  if (!ok) {
    const err = logs.split(/\r?\n/).findIndex((l) => /^!\s/.test(l));
    console.error(`✗ ${name}.tex: ошибка компиляции (${engine}, ${secs} с), PDF не обновлён`);
    if (err >= 0) console.error(logs.split(/\r?\n/).slice(err, err + 8).join('\n'));
    return 1;
  }
  writeAtomic(path.join(dir, name + '.pdf'), pdfRes.body);
  const warnings = [...new Set(logs.split(/\r?\n/).filter((l) =>
    /^(?:LaTeX(?: Font)?|Package \S+|Class \S+|pdfTeX|Font) Warning:|^(?:Over|Under)full \\[hv]box|^Missing character:/i.test(l)))];
  console.log(`✓ ${name}.tex → ${name}.pdf (${engine}, ${secs} с)` + (warnings.length ? '\n' + warnings.join('\n') : ''));
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
