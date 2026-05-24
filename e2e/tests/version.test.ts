import { describe, test, expect, beforeAll } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession } from '../helpers/client';

/**
 * SC-01 — `/version` reachable. PMG 9.x has no token API at all, so the
 * suite-wide auth path is **ticket** rather than token. (PBS/PVE use
 * token for this scenario; PMG can't.)
 */
describe('SC-01: /version', () => {
  let creds: Credentials;

  beforeAll(() => {
    creds = loadCredentials();
  });

  test('returns expected shape with ticket auth', async () => {
    const session = await createTicketSession(creds);
    const res = await session.pmg.version().version();

    // PMG `/version` envelope: `{ data: { release, repoid, version, ... } }`.
    expect(res).toBeDefined();
    expect(res.data).toBeDefined();
    expect(typeof res.data.release).toBe('string');
    expect(typeof res.data.repoid).toBe('string');
    expect(typeof res.data.version).toBe('string');

    // PMG 9.x containers ship the 9-series. Sanity-check the major to
    // catch accidental image-tag drift in CI.
    expect(res.data.version.startsWith('9')).toBe(true);
  });
});
