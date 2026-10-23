import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import { uploadLimits } from '../../config/env.js';
import type { FileKind } from '../../models/Document.js';
import { AppError } from '../../utils/errors.js';

export interface DetectedFile {
  mimeType: string;
  ext: 'pdf' | 'png' | 'jpg' | 'webp' | 'txt' | 'docx';
  fileKind: FileKind;
}

/**
 * Detect the real file type from its content (magic numbers), never from the
 * client-provided MIME type or extension alone. TXT has no signature, so for it we
 * check that the bytes decode as UTF-8 text without NUL bytes.
 */
export async function detectFileType(filePath: string, originalName: string): Promise<DetectedFile> {
  const stat = await fs.stat(filePath);
  if (stat.size === 0) throw new AppError(400, 'EMPTY_FILE', 'The uploaded file is empty.');

  const sniffed = await fileTypeFromFile(filePath);
  const ext = path.extname(originalName).toLowerCase();

  if (sniffed) {
    switch (sniffed.mime) {
      case 'application/pdf':
        return { mimeType: 'application/pdf', ext: 'pdf', fileKind: 'pdf' };
      case 'image/png':
        return { mimeType: 'image/png', ext: 'png', fileKind: 'image' };
      case 'image/jpeg':
        return { mimeType: 'image/jpeg', ext: 'jpg', fileKind: 'image' };
      case 'image/webp':
        return { mimeType: 'image/webp', ext: 'webp', fileKind: 'image' };
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return { mimeType: sniffed.mime, ext: 'docx', fileKind: 'docx' };
      case 'application/zip':
        // file-type reports generic zip for some DOCX; trust the extension only in that case.
        if (ext === '.docx') {
          return { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx', fileKind: 'docx' };
        }
        break;
    }
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', `This file looks like "${sniffed.mime}", which is not supported.`);
  }

  // No signature: accept as plain text only when it decodes cleanly.
  if (ext === '.txt' || uploadLimits.acceptedExtensions.includes(ext)) {
    const sample = await readHead(filePath, 64 * 1024);
    if (sample.includes(0)) throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'This file contains binary data and cannot be read as text.');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
    } catch {
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'This text file is not valid UTF-8.');
    }
    if (ext !== '.txt') throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'The file content does not match its extension.');
    return { mimeType: 'text/plain', ext: 'txt', fileKind: 'text' };
  }
  throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported.');
}

async function readHead(filePath: string, bytes: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
