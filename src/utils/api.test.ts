import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getSessionId, getAdminToken, setAdminToken, clearAdminToken, isAdminMode, apiFetch } from './api';

describe('api utils', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('getSessionId', () => {
    it('should generate a valid UUID on first call', () => {
      const sessionId = getSessionId();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should store the generated session_id in localStorage', () => {
      const sessionId = getSessionId();
      expect(localStorage.getItem('logicrefiner_session_id')).toBe(sessionId);
    });

    it('should reuse existing session_id on subsequent calls', () => {
      const fixedId = 'existing-session-id';
      localStorage.setItem('logicrefiner_session_id', fixedId);

      const sessionId = getSessionId();
      expect(sessionId).toBe(fixedId);
    });

    it('should not generate a new UUID if one already exists', () => {
      const first = getSessionId();
      const second = getSessionId();
      expect(second).toBe(first);
    });
  });

  describe('admin token management', () => {
    it('setAdminToken should store token in localStorage', () => {
      setAdminToken('my-admin-token');
      expect(localStorage.getItem('logicrefiner_admin_token')).toBe('my-admin-token');
    });

    it('getAdminToken should return stored token', () => {
      setAdminToken('my-admin-token');
      expect(getAdminToken()).toBe('my-admin-token');
    });

    it('getAdminToken should return null if not set', () => {
      expect(getAdminToken()).toBeNull();
    });

    it('clearAdminToken should remove token from localStorage', () => {
      setAdminToken('my-admin-token');
      clearAdminToken();
      expect(localStorage.getItem('logicrefiner_admin_token')).toBeNull();
    });

    it('isAdminMode should return true when token is set', () => {
      setAdminToken('my-admin-token');
      expect(isAdminMode()).toBe(true);
    });

    it('isAdminMode should return false when token is not set', () => {
      expect(isAdminMode()).toBe(false);
    });
  });

  describe('apiFetch', () => {
    it('should include X-Session-Id header', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.get('X-Session-Id')).toBeDefined();
      expect(options.headers.get('X-Session-Id')).toBe(getSessionId());
    });

    it('should include Authorization header when admin token is set', async () => {
      setAdminToken('my-admin-token');
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.get('Authorization')).toBe('Bearer my-admin-token');
    });

    it('should not include Authorization header when admin token is not set', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.get('Authorization')).toBeNull();
    });

    it('should preserve custom headers passed by caller', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('{}'));
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test', {
        headers: { 'Content-Type': 'application/json' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.get('Content-Type')).toBe('application/json');
      expect(options.headers.get('X-Session-Id')).toBeDefined();
    });
  });
});
