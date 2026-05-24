import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession } from '../helpers/client';
import { cleanupE2E } from '../helpers/fixtures';
import { Pmg } from '../../src/Pmg';

/**
 * SC-40..42 — error envelopes.
 *
 * PMG 9.x has no token API, so SC-42 (privsep token denied) is omitted
 * — there's nothing for the SDK to surface there. SC-40/41 still
 * exercise the typed-error contract on the surfaces PMG does expose.
 */
describe('errors', () => {
  let creds: Credentials;
  let pmg: Pmg;

  beforeAll(async () => {
    creds = loadCredentials();
    pmg = (await createTicketSession(creds)).pmg;
    await cleanupE2E(pmg);
  });

  afterAll(async () => {
    await cleanupE2E(pmg);
  });

  test('SC-40: unknown user surfaces as an error response', async () => {
    await expect(
      pmg.accessUsers().readGetUsers({ userid: 'e2e-nonexistent@pmg' }),
    ).rejects.toMatchObject({
      // PMG returns 500 (Perl-family exception path) rather than 404
      // for "no such user". The SDK still produces a ResponseError —
      // that's the contract.
      response: { status: 500 },
    });
  });

  test('SC-41: invalid input (empty userid) returns 400', async () => {
    await expect(
      pmg.accessUsers().createUsers({
        accessUsersCreateUsersRequest: { userid: '', role: 'audit' },
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  // SC-42 (privsep token denied) — omitted: PMG 9.x has no token API,
  // so there's nothing to scope to a privsep boundary. The
  // `(unsupported-by-pmg)` sentinel in PROXMOX_TOKEN_VALUE is what the
  // plan calls out for this case.
});
