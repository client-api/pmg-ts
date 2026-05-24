import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession } from '../helpers/client';
import { cleanupE2E, E2E_PREFIX, E2E_DOMAIN_SUFFIX } from '../helpers/fixtures';
import { Pmg } from '../../src/Pmg';

/**
 * SC-30..34 — CRUD baseline against safe, idempotent PMG surfaces.
 *
 * PMG has no `/storage` (PVE-only) and no datastore (PBS-only). The
 * closest CRUD surface is `/config/domains` (relay-domain whitelist) —
 * a list of `{ domain, comment }` records that PMG keeps for mail
 * routing. SC-32 uses that.
 *
 * PMG has no ACL API. SC-33 (ACL CRUD) is omitted from this suite —
 * privilege is on the user record itself, exercised by SC-21 already.
 */
describe('crud', () => {
  let creds: Credentials;
  let pmg: Pmg;

  const USER = `${E2E_PREFIX}user-01@pmg`;
  const DOMAIN = `${E2E_PREFIX}crud${E2E_DOMAIN_SUFFIX}`;

  beforeAll(async () => {
    creds = loadCredentials();
    pmg = (await createTicketSession(creds)).pmg;
    await cleanupE2E(pmg);
  });

  afterAll(async () => {
    await cleanupE2E(pmg);
  });

  test('SC-30: list users contains root@pam', async () => {
    const res = await pmg.accessUsers().getUsers();
    const users = (res as { data?: Array<{ userid?: string }> }).data ?? [];
    expect(users.some((u) => u.userid === 'root@pam')).toBe(true);
  });

  test('SC-31: create + list + delete e2e user', async () => {
    await pmg.accessUsers().createUsers({
      accessUsersCreateUsersRequest: {
        userid: USER,
        password: 'Sc31!2026-xyz',
        role: 'audit',
        enable: 1,
      },
    });

    const list1 = await pmg.accessUsers().getUsers();
    const list1Users = (list1 as { data?: Array<{ userid?: string }> }).data ?? [];
    expect(list1Users.some((u) => u.userid === USER)).toBe(true);

    await pmg.accessUsers().deleteUsers({ userid: USER });

    const list2 = await pmg.accessUsers().getUsers();
    const list2Users = (list2 as { data?: Array<{ userid?: string }> }).data ?? [];
    expect(list2Users.some((u) => u.userid === USER)).toBe(false);
  });

  test('SC-32: relay-domain CRUD', async () => {
    // PMG's CreateDomains body is generated with a confusing name —
    // `configDkimCreateDomainsRequest` — because the OpenAPI generator
    // collapsed the domain and DKIM models into one. The wire body is
    // still `{ domain, comment? }`.
    await pmg.configDomains().createDomains({
      configDkimCreateDomainsRequest: { domain: DOMAIN, comment: 'e2e test domain' },
    });

    const got = (await pmg.configDomains().readGetDomains({ domain: DOMAIN })) as {
      data?: { domain?: string; comment?: string };
    };
    expect(got.data?.domain).toBe(DOMAIN);
    expect(got.data?.comment).toBe('e2e test domain');

    await pmg.configDomains().deleteDomains({ domain: DOMAIN });

    await expect(pmg.configDomains().readGetDomains({ domain: DOMAIN })).rejects.toBeDefined();
  });

  // SC-33 (ACL CRUD) — omitted: PMG has no ACL API. SC-21 already
  // exercises role-based privilege on the user record.

  test('SC-34: pagination — getUsers full enumeration', async () => {
    // PMG's /access/users doesn't paginate. Walk the full set and assert
    // shape — same pattern as PBS/PVE.
    const res = await pmg.accessUsers().getUsers();
    const users = (res as { data?: Array<{ userid?: string }> }).data ?? [];
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => typeof u.userid === 'string')).toBe(true);
  });
});
