import { describe, test, expect, beforeAll } from 'vitest';

import { loadCredentials, type Credentials, tokenAuthSupported } from '../helpers/credentials';
import { createTicketSession, AUTH_COOKIE_NAME } from '../helpers/client';
import { Pmg } from '../../src/Pmg';
import { Configuration } from '../../src/runtime';

/**
 * SC-10..14 — authentication surface.
 *
 * PMG 9.x has **no token API at all**. The credentials JSON ships
 * `token_value: "(unsupported-by-pmg)"` as a sentinel, and
 * `tokenAuthSupported(creds)` returns `false` against it — SC-12 and
 * SC-13 skip themselves automatically.
 *
 * Ticket auth (SC-10/14) is therefore the only auth path the rest of
 * the PMG suite uses.
 */
describe('auth', () => {
  let creds: Credentials;

  beforeAll(() => {
    creds = loadCredentials();
  });

  test('SC-10: ticket login returns ticket + CSRF token', async () => {
    const session = await createTicketSession(creds);
    expect(session.ticket).toMatch(/^PMG:/);
    expect(session.csrfToken.length).toBeGreaterThan(0);

    const version = await session.pmg.version().version();
    expect(version.data?.version).toMatch(/^9/);
  });

  test('SC-11: ticket login with bad password returns 401', async () => {
    const bootstrap = new Pmg(
      new Configuration({ basePath: creds.url + '/api2/json' }),
    );
    await expect(
      bootstrap.accessTicket().createTicket({
        accessTicketCreateTicketRequest: {
          username: creds.user,
          password: 'not-the-password',
        },
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });

  // SC-12 and SC-13 are the token-auth scenarios. PMG 9.x has no token
  // API at all — these tests `skipIf` against the PMG sentinel.
  // `tokenAuthSupported(creds)` is computed at describe-time via the
  // shared helper; the body is intentionally a placeholder that never
  // runs against PMG.
  test.skipIf(!tokenAuthSupported(loadCredentials()))(
    'SC-12: token-authenticated request returns 200 (skipped on PMG)',
    () => {
      throw new Error('SC-12 should be skipped on PMG');
    },
  );

  test.skipIf(!tokenAuthSupported(loadCredentials()))(
    'SC-13: malformed token returns 401 (skipped on PMG)',
    () => {
      throw new Error('SC-13 should be skipped on PMG');
    },
  );

  test('SC-14: state-changing request without CSRFPreventionToken returns 401', async () => {
    const session = await createTicketSession(creds);

    // Cookie set, CSRF header missing.
    const noCsrf = new Pmg(
      new Configuration({
        basePath: creds.url + '/api2/json',
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${session.ticket}` },
      }),
    );

    // Create-user is a state-changing endpoint. PMG responds 401 when
    // the CSRF header is missing on a ticket-authenticated session.
    await expect(
      noCsrf.accessUsers().createUsers({
        accessUsersCreateUsersRequest: {
          userid: 'e2e-csrf-probe@pmg',
          role: 'audit',
        },
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });
  });
});
