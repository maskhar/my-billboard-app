export function safeParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      return value as T;
    }
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
