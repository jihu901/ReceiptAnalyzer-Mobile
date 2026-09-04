import {describe, expect, it} from 'vitest';
import {actionableError} from './messages.js';

describe('actionableError', () => {
  it('explains expired pairing keys', () => {
    expect(actionableError(new Error('403 invalid key'))).toContain('연결 QR');
  });

  it('explains storage errors', () => {
    expect(actionableError(new Error('storage quota'))).toContain('Google Drive');
  });

  it('keeps a useful server message', () => {
    expect(actionableError(new Error('파일이 손상되었습니다.'))).toBe('파일이 손상되었습니다.');
  });
});
