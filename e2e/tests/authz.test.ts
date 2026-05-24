import { describe, test, expect, beforeAll, afterAll } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession, AUTH_COOKIE_NAME } from '../helpers/client';
import { cleanupE2E, E2E_PREFIX } from '../helpers/fixtures';
import { Pmg } from '../../src/Pmg';
import { Configuration } from '../../src/runtime';

/**
 * SC-20..22 — authorization.
 *
 * PMG has **no ACL API** — privilege is carried on the user record's
 * `role` field rather than per-path ACL entries. The plan's contract
 * still maps cleanly:
 *
 *   SC-20: create an `audit` (read-only) user, prove it can't mutate.
 *   SC-21: admin (root) can create users.
 *   SC-22: `/access/users/{id}` returns the user's role — that's the
 *          PMG-shaped "effective permissions" surface.
 */
describe('authz', () => {
  let creds: Credentials;
  let admin: Pmg;

  const RO_USER = `${E2E_PREFIX}readonly@pmg`;
  const RO_PASS = 'ReadOnly!2026-abc';

  beforeAll(async () => {
    creds = loadCredentials();
    admin = (await createTicketSession(creds)).pmg;
    await cleanupE2E(admin);
  });

  afterAll(async () => {
    await cleanupE2E(admin);
  });

  test('SC-21: admin (ticket session) can create entities', async () => {
    await admin.accessUsers().createUsers({
      accessUsersCreateUsersRequest: {
        userid: RO_USER,
        password: RO_PASS,
        role: 'audit',
        enable: 1,
      },
    });

    const users = (await admin.accessUsers().getUsers()) as {
      data?: Array<{ userid?: string }>;
    };
    expect((users.data ?? []).some((u) => u.userid === RO_USER)).toBe(true);
  });

  test('SC-20: audit (read-only) user cannot create entities', async () => {
    const bootstrap = new Pmg(new Configuration({ basePath: creds.url + '/api2/json' }));
    const login = await bootstrap.accessTicket().createTicket({
      accessTicketCreateTicketRequest: { username: RO_USER, password: RO_PASS },
    });
    const ticket = login.data?.ticket;
    const csrf = login.data?.cSRFPreventionToken;
    expect(ticket).toBeTruthy();

    const ro = new Pmg(
      new Configuration({
        basePath: creds.url + '/api2/json',
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${ticket}`,
          CSRFPreventionToken: csrf ?? '',
        },
      }),
    );

    await expect(
      ro.accessUsers().createUsers({
        accessUsersCreateUsersRequest: {
          userid: `${E2E_PREFIX}other@pmg`,
          role: 'audit',
        },
      }),
    ).rejects.toMatchObject({ response: { status: 403 } });
  });

  test("SC-22: /access/users/{id} returns the user's role", async () => {
    const res = (await admin.accessUsers().readGetUsers({ userid: RO_USER })) as {
      data?: { role?: string; enable?: number | string };
    };
    // PMG's "effective permissions" surface is the user's role field;
    // the suite confirms the SDK preserves it across the round-trip.
    expect(res.data?.role).toBe('audit');
    // PMG's `/access/users/{userid}` response data is typed as `object`
    // (unstructured) in the spec, so the `PmgBooleanFromJSON` coerce
    // doesn't fire for `enable` — the wire-string `"1"` passes through
    // verbatim. Accept either shape; the contract is "truthy when
    // enabled". Tracked upstream as a spec-level typing gap.
    expect(['1', 1]).toContain(res.data?.enable);
  });
});
