import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError, isAppError } from '../utils/errors.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} does not exist.`, requestId: req.requestId },
  });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError;

  if (isAppError(err)) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = AppError.badRequest('Some fields are invalid.', err.flatten().fieldErrors);
  } else if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'That file is larger than the allowed upload size.');
    } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      appError = AppError.badRequest('Too many files or an unexpected upload field.');
    } else {
      appError = AppError.badRequest(err.message);
    }
  } else if (err instanceof mongoose.Error.CastError) {
    appError = AppError.badRequest('A provided identifier is not valid.');
  } else if (err instanceof mongoose.Error.ValidationError) {
    appError = AppError.badRequest('The data did not pass validation.', Object.keys(err.errors));
  } else if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 11000) {
    appError = AppError.conflict('A record with those details already exists.');
  } else if (err instanceof mongoose.mongo.MongoServerSelectionError || err instanceof mongoose.mongo.MongoNetworkError) {
    appError = new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again shortly.', { expose: true });
  } else if (err && typeof err === 'object' && 'type' in err && (err as { type: unknown }).type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  } else if (err && typeof err === 'object' && 'type' in err && (err as { type: unknown }).type === 'entity.parse.failed') {
    appError = AppError.badRequest('The request body is not valid JSON.');
  } else {
    appError = AppError.internal(undefined, err);
  }

  const logPayload = { requestId: req.requestId, code: appError.code, status: appError.status, path: req.path, method: req.method };
  if (appError.status >= 500) {
    logger.error({ ...logPayload, err: appError.cause ?? appError }, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  if (res.headersSent) return;

  res.status(appError.status).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.expose || !isProd ? appError.message : 'Something went wrong on our side.',
      requestId: req.requestId,
      ...(appError.details !== undefined && appError.expose ? { details: appError.details } : {}),
      ...(!isProd && appError.status >= 500 && appError.cause instanceof Error ? { debug: appError.cause.message } : {}),
    },
  });
};
