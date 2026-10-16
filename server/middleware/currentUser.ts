import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../shared/types';
import { Errors } from '../errors';
import { findUser } from '../repository/configRepository';

export function currentUser(req: Request, _res: Response, next: NextFunction) {
  const id = req.header('X-User-Id');
  const user = findUser(id);
  req.user = user?.active ? user : undefined;
  next();
}

/** 변경 API는 활성 사용자가 필요하다 */
export function requireUserForWrite(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.user) throw Errors.userRequired();
  next();
}

export function userOf(req: Request): User {
  if (!req.user) throw Errors.userRequired();
  return req.user;
}

export function requireManager(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw Errors.userRequired();
  if (req.user.role !== 'MANAGER') throw Errors.forbidden();
  next();
}
