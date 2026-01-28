export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const error = err as { response?: { data?: { error?: string } } };
  return error.response?.data?.error || fallback;
}
