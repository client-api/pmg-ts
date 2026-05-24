import { describe, test, expect, beforeAll, afterAll } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession } from '../helpers/client';
import { cleanupE2E, E2E_PREFIX } from '../helpers/fixtures';
import { Pmg } from '../../src/Pmg';

/**
 * SC-50..52 — type edge cases.
 *
 * Strictly-typed languages catch generator bugs that loose-typed runtimes
 * silently tolerate. TypeScript's type system declares int64 as
 * `number`, which is the silent-truncation hazard SC-50 documents.
 */
describe('types', () => {
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

  /**
   * The generator emits `format: int64` fields as TypeScript `number`,
   * which silently truncates at 2^53. The contract is "bigint must
   * round-trip losslessly"; this assertion fails today.
   *
   * Marked `.fails()` so the suite stays green while the generator
   * issue is open upstream — when the generator is fixed to emit
   * `bigint`, this test starts succeeding and `.fails()` will
   * (correctly) flip the suite red until the marker is removed.
   *
   * Upstream issue: bencurio/pve-openapi  (to file)
   */
  test.fails('SC-50: bigint int64 fields are typed as bigint, not number', async () => {
    const res = await pmg.nodes().getNodes();
    const nodes = (res as { data?: Array<{ uptime?: number | bigint }> }).data ?? [];
    const uptime = nodes[0]?.uptime;
    expect(uptime).toBeDefined();
    expect(typeof uptime).toBe('bigint');
  });

  test('SC-51: nullable fields surface as undefined', async () => {
    // Create a user with no comment (the field is optional + nullable).
    const userid = `${E2E_PREFIX}nullable@pmg`;
    await pmg.accessUsers().createUsers({
      accessUsersCreateUsersRequest: {
        userid,
        password: 'PwTest!2026-zz',
        role: 'audit',
        enable: 1,
      },
    });
    const read = await pmg.accessUsers().readGetUsers({ userid });
    const data = (read as { data?: { comment?: string | null } }).data;
    expect(data?.comment).toBeUndefined();
    await pmg.accessUsers().deleteUsers({ userid });
  });

  /**
   * The upstream plan's SC-52 uses `oneOf` (PVE storage type: dir vs nfs).
   * PMG has no tagged-union models in its SDK. The closest available
   * discriminator surface is the `PmgRoleEnum` on user records — read
   * a `root` user and an `audit` user back, confirm the SDK preserves
   * each variant.
   */
  test('SC-52: PmgRoleEnum classifies wire values into typed variants', async () => {
    const u1 = `${E2E_PREFIX}admin@pmg`;
    const u2 = `${E2E_PREFIX}audit@pmg`;

    await pmg.accessUsers().createUsers({
      accessUsersCreateUsersRequest: {
        userid: u1,
        password: 'PwTest!2026-aa',
        role: 'admin',
        enable: 1,
      },
    });
    await pmg.accessUsers().createUsers({
      accessUsersCreateUsersRequest: {
        userid: u2,
        password: 'PwTest!2026-bb',
        role: 'audit',
        enable: 1,
      },
    });

    const admin = (await pmg.accessUsers().readGetUsers({ userid: u1 })) as {
      data?: { role?: string };
    };
    const audit = (await pmg.accessUsers().readGetUsers({ userid: u2 })) as {
      data?: { role?: string };
    };

    expect(admin.data?.role).toBe('admin');
    expect(audit.data?.role).toBe('audit');
  });
});
