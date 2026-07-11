import { describe, it, expect, vi, beforeEach } from 'vitest';

// 需要模拟 ADMIN_TOKEN 环境变量
vi.mock('dotenv', () => ({
  default: {
    config: () => {},
  },
}));

// 在导入 auth 之前设置环境变量
process.env.ADMIN_TOKEN = 'test-admin-token';

import { getAuthContext } from './auth';

describe('getAuthContext', () => {
  function createMockReq(headers: Record<string, string> = {}) {
    return { headers } as any;
  }

  it('should identify admin with correct Bearer token', () => {
    const req = createMockReq({ authorization: 'Bearer test-admin-token' });
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(true);
  });

  it('should identify visitor with X-Session-Id but no admin token', () => {
    const req = createMockReq({ 'x-session-id': 'session-a' });
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.sessionId).toBe('session-a');
  });

  it('should return null sessionId when no X-Session-Id header', () => {
    const req = createMockReq({});
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(false);
    expect(ctx.sessionId).toBeNull();
  });

  it('should not be admin with wrong token', () => {
    const req = createMockReq({ authorization: 'Bearer wrong-token' });
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(false);
  });

  it('should not be admin with malformed authorization header', () => {
    const req = createMockReq({ authorization: 'test-admin-token' });
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(false);
  });

  it('should be admin and ignore sessionId when admin token is present', () => {
    const req = createMockReq({
      authorization: 'Bearer test-admin-token',
      'x-session-id': 'some-session',
    });
    const ctx = getAuthContext(req);
    expect(ctx.isAdmin).toBe(true);
  });
});
