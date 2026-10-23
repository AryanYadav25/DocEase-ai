import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { AppError } from '../../utils/errors.js';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

/** Target characters per synthetic "page" when a format has no page concept. */
const SYNTHETIC_PAGE_CHARS = 3000;

/** Split long text into synthetic pages at paragraph boundaries so references still work. */
export function paginateText(text: string): ExtractedPage[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [{ pageNumber: 1, text: '' }];
  const paragraphs = clean.split(/\n\n+/);
  const pages: ExtractedPage[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if (buf && buf.length + p.length + 2 > SYNTHETIC_PAGE_CHARS) {
      pages.push({ pageNumber: pages.length + 1, text: buf.trim() });
      buf = '';
    }
    // Very long paragraph without breaks: hard-split.
    if (p.length > SYNTHETIC_PAGE_CHARS * 2) {
      for (let i = 0; i < p.length; i += SYNTHETIC_PAGE_CHARS) {
        if (buf) {
          pages.push({ pageNumber: pages.length + 1, text: buf.trim() });
          buf = '';
        }
        pages.push({ pageNumber: pages.length + 1, text: p.slice(i, i + SYNTHETIC_PAGE_CHARS).trim() });
      }
      continue;
    }
    buf += (buf ? '\n\n' : '') + p;
  }
  if (buf.trim()) pages.push({ pageNumber: pages.length + 1, text: buf.trim() });
  return pages;
}

export async function extractPlainText(filePath: string): Promise<ExtractedPage[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  return paginateText(raw.replace(/^﻿/, ''));
}

export async function extractDocxText(filePath: string): Promise<ExtractedPage[]> {
  try {
    // mammoth only reads document.xml paragraphs; it never executes macros or embedded objects.
    const result = await mammoth.extractRawText({ path: filePath });
    return paginateText(result.value);
  } catch (err) {
    throw new AppError(422, 'CORRUPT_FILE', 'This DOCX file could not be read. It may be corrupt or password-protected.', { cause: err });
  }
}
