const SESSION_KEY = 'logicrefiner_session_id';
const ADMIN_TOKEN_KEY = 'logicrefiner_admin_token';

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function isAdminMode(): boolean {
  return getAdminToken() !== null;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Session-Id', getSessionId());
  const adminToken = getAdminToken();
  if (adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }
  return fetch(url, { ...options, headers });
}
