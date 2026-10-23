import { randomUUID } from 'node:crypto';
import multer from 'multer';
import path from 'node:path';
import { uploadLimits } from '../config/env.js';
import { TMP_ROOT } from '../services/storage/storageService.js';
import { AppError } from '../utils/errors.js';

const diskStorage = multer.diskStorage({
  destination: TMP_ROOT,
  filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
});

export const uploadMiddleware = multer({
  storage: diskStorage,
  limits: {
    fileSize: uploadLimits.maxFileSizeBytes,
    files: uploadLimits.maxFilesPerUpload,
    fields: 10,
  },
  fileFilter: (_req, file, cb) => {
    // First line of defence only; the real check is the magic-number sniff in documentService.
    const ext = path.extname(file.originalname).toLowerCase();
    if (!uploadLimits.acceptedExtensions.includes(ext)) {
      return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', `Files of type "${ext || 'unknown'}" are not supported.`));
    }
    cb(null, true);
  },
});
