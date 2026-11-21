export function isInvalidSessionResponse(status: number, endpoint?: string): boolean {
  return status === 401 && endpoint === '/auth/me';
}
