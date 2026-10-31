import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PDF_LIBRARY_MARKERS = ['/FontFile2', 'pdfuaid', 'Unknown font format'];
const WORKER_CHUNK = /^worker-[A-Za-z0-9_-]{8}\.js$/;
const LOADED_BY_PAGE = /(?:src|href)="([^"]+\.js)"/g;

function scripts(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return scripts(path, root);
    }
    return name.endsWith('.js') || name.endsWith('.mjs') ? [relative(root, path)] : [];
  });
}

export function receiptChunkProblems(distDir) {
  const problems = [];
  const carriers = scripts(distDir)
    .sort()
    .filter((file) => {
      const content = readFileSync(join(distDir, file), 'utf8');
      return PDF_LIBRARY_MARKERS.some((marker) => content.includes(marker));
    });
  for (const file of carriers) {
    if (!WORKER_CHUNK.test(file)) {
      problems.push(`${file} carries the PDF library, which only the receipt worker may hold`);
    }
  }
  const workers = carriers.filter((file) => WORKER_CHUNK.test(file));
  if (workers.length === 0) {
    problems.push(
      'no worker-<hash>.js carries the PDF library, so the check found nothing to confine',
    );
  }
  const page = readFileSync(join(distDir, 'index.html'), 'utf8');
  const loaded = new Set([...page.matchAll(LOADED_BY_PAGE)].map((match) => match[1]));
  for (const file of carriers) {
    if (loaded.has(file)) {
      problems.push(`index.html loads ${file}, so every visitor would fetch the PDF library`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [distDir] = process.argv.slice(2);
  if (!distDir) {
    console.error('usage: node scripts/check-receipt-chunks.mjs <dist-dir>');
    process.exit(2);
  }
  const problems = receiptChunkProblems(distDir);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`::error::${problem}`);
    }
    process.exit(1);
  }
  console.log(
    'receipt chunks: only the receipt worker carries the PDF library, and the page loads none of it',
  );
}
