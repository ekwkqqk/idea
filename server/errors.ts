export type ErrorDetail = { field?: string; message: string };

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: ErrorDetail[] = [],
  ) {
    super(message);
  }
}

export const Errors = {
  validation: (details: ErrorDetail[] = [], message = '입력값을 확인하세요.') =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  userRequired: () => new AppError(401, 'USER_REQUIRED', '화면 상단에서 사용자를 선택하세요.'),
  forbidden: (message = '이 작업을 할 권한이 없습니다.') => new AppError(403, 'FORBIDDEN', message),
  forbiddenTransition: () => new AppError(403, 'FORBIDDEN_TRANSITION', '현재 역할로는 이 상태로 바꿀 수 없습니다.'),
  notAssignee: () => new AppError(403, 'NOT_ASSIGNEE', '담당자만 처리할 수 있습니다.'),
  notFound: (message = '대상을 찾을 수 없습니다.') => new AppError(404, 'NOT_FOUND', message),
  versionConflict: () =>
    new AppError(409, 'VERSION_CONFLICT', '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.'),
  fileTooLarge: () => new AppError(413, 'FILE_TOO_LARGE', '파일 크기 제한을 넘었습니다.'),
  unsupportedFile: () => new AppError(415, 'UNSUPPORTED_FILE', '허용하지 않는 파일 형식입니다.'),
  invalidTransition: () => new AppError(422, 'INVALID_TRANSITION', '현재 상태에서 할 수 없는 작업입니다.'),
  precondition: (message: string) => new AppError(422, 'PRECONDITION_FAILED', message),
  configInUse: (message = '이슈에서 사용 중이라 삭제할 수 없습니다.') => new AppError(422, 'CONFIG_IN_USE', message),
  noActiveManager: () => new AppError(422, 'NO_ACTIVE_MANAGER', 'PL/PM 사용자가 한 명 이상 있어야 합니다.'),
  storageWriteFailed: () =>
    new AppError(500, 'STORAGE_WRITE_FAILED', '저장 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.'),
};
