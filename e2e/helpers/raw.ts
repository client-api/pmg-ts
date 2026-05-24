import type { Pmg } from '../../src/Pmg';
import { configFor } from './client';

/**
 * Escape hatch for endpoints where the OpenAPI generator drops fields
 * that the wire endpoint actually requires. Reuses the SDK's basePath
 * + auth callback so tokens stay in the Configuration object — never
 * reconstructed by hand.
 *
 * Tracked upstream as a generator bug family:
 *   https://github.com/bencurio/pve-openapi
 */
export async function rawJson<T = unknown>(
  pmg: Pmg,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { basePath, authHeader } = configFor(pmg);
  const res = await fetch(`${basePath}${path}`, {
    method,
    headers: {
      Authorization: await authHeader(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
