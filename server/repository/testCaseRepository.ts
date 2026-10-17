import type { TestCase, TestCasesFile } from '../../shared/types';
import { Errors } from '../errors';
import { TESTCASES_FILE } from '../paths';
import { FileStore } from './fileStore';

const SCHEMA_VERSION = 1;

export const testCaseStore = new FileStore<TestCasesFile>(TESTCASES_FILE, () => ({
  schemaVersion: SCHEMA_VERSION,
  testCases: [],
}));

export function loadTestCases() {
  testCaseStore.load((raw) => {
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`지원하지 않는 testcases.json 버전입니다: ${raw.schemaVersion}`);
    }
    return raw;
  });
}

export function allTestCases(): TestCase[] {
  return testCaseStore.read().testCases;
}

export function findTestCase(id: string | null | undefined): TestCase | undefined {
  if (!id) return undefined;
  return testCaseStore.read().testCases.find((t) => t.id === id);
}

export function getTestCase(id: string): TestCase {
  const tc = findTestCase(id);
  if (!tc) throw Errors.notFound('테스트케이스를 찾을 수 없습니다.');
  return tc;
}
