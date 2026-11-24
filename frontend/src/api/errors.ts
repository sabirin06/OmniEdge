import { isAxiosError } from 'axios';

export function requestError(error: unknown, fallback: string): string {
  if (error instanceof SyntaxError) return 'Enter valid JSON for the match conditions.';
  if (!isAxiosError(error)) return fallback;
  const data = error.response?.data;
  const fields = data?.errors;
  if (typeof fields === 'string') return fields;
  if (fields && typeof fields === 'object') return Object.values(fields).flat().join(' ') || fallback;
  return data?.detail ?? fallback;
}
