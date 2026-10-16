import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError, Errors } from '../errors';
import { logger } from '../logger';

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return Errors.validation(err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return Errors.fileTooLarge();
    return Errors.validation([{ field: err.field, message: '업로드 파일 개수 또는 형식을 확인하세요.' }]);
  }
  if (err instanceof SyntaxError && 'body' in err) return Errors.validation([], '요청 형식(JSON)이 올바르지 않습니다.');
  return new AppError(500, 'INTERNAL_ERROR', '알 수 없는 오류가 발생했습니다.');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const appError = toAppError(err);
  const logExtra = {
    user: req.user?.id ?? req.header('X-User-Id') ?? null,
    method: req.method,
    path: req.originalUrl,
    code: appError.code,
    ...(appError.status >= 500 ? { stack: err instanceof Error ? err.stack : String(err) } : {}),
  };
  if (appError.status >= 500) logger.error(appError.message, logExtra);
  else logger.warn(appError.message, logExtra);

  res.status(appError.status).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
  });
}
