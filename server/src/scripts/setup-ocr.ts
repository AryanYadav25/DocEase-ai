/**
 * Downloads Tesseract language data so OCR works offline.
 * Usage: npm run setup:ocr            (installs OCR_LANGUAGES from .env, default "eng")
 *        npm run setup:ocr -- hin eng (installs specific languages)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

const SOURCE = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main';

async function main() {
  const langs = process.argv.slice(2).length ? process.argv.slice(2) : env.OCR_LANGUAGES.split('+');
  const dir = path.resolve(process.cwd(), env.OCR_LANG_PATH);
  await fs.mkdir(dir, { recursive: true });
  for (const lang of langs) {
    const dest = path.join(dir, `${lang}.traineddata`);
    try {
      const stat = await fs.stat(dest);
      if (stat.size > 100000) {
        console.log(`✓ ${lang}.traineddata already present`);
        continue;
      }
    } catch {
      /* not present */
    }
    const url = `${SOURCE}/${lang}.traineddata`;
    console.log(`Downloading ${url} ...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${lang}: ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    console.log(`✓ Saved ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }
  console.log(`OCR language data installed in ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
