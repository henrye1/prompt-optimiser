import { HttpError } from '../middleware/error.js';

/** Returns a trimmed non-empty string or throws 400. */
export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

/** Returns a string (possibly empty) or throws 400 if present-but-not-a-string. */
export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  return value;
}

/** Returns a positive integer or throws 400. */
export function requireInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new HttpError(400, `${field} must be an integer`);
  }
  return value;
}

export function optionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireInt(value, field);
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be a boolean`);
  return value;
}

/** Parses an :id route param as a positive integer or throws 400. */
export function parseId(value: string, field = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${field}`);
  return n;
}
