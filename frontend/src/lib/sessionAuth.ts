export function isInvalidSessionResponse(status: number, endpoint?: string, message?: string): boolean {
  if (status !== 401) return false;
  if (endpoint === '/auth/me') return true;

  return message === 'User not found'
    || message === 'Token invalid or expired'
    || message === 'Not authorized, no token';
}
