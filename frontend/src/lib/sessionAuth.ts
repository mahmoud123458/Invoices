export function isInvalidSessionResponse(status: number, _message?: string): boolean {
  return status === 401;
}
