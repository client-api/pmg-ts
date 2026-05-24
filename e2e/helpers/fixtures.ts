import type { Pmg } from '../../src/Pmg';

/**
 * Every e2e-created entity is named with this prefix so cleanup can find
 * them even when a previous run bailed mid-test. Matches upstream §3.5
 * "test data conventions".
 */
export const E2E_PREFIX = 'e2e-';
/** PMG relay-domain entries are DNS names, so prefix with a label that
 *  joins cleanly under a private TLD. */
export const E2E_DOMAIN_SUFFIX = '.e2e.invalid';

/**
 * Best-effort cleanup of e2e-* entities. PMG has no VMs/containers,
 * no datastores, no ACL — just users and a handful of mail-routing
 * config endpoints. Errors are swallowed so the suite is idempotent
 * even when a previous run bailed.
 */
export async function cleanupE2E(pmg: Pmg): Promise<void> {
  await Promise.allSettled([cleanupUsers(pmg), cleanupDomains(pmg)]);
}

async function cleanupUsers(pmg: Pmg): Promise<void> {
  const res = await pmg.accessUsers().getUsers();
  const users = (res as { data?: Array<{ userid?: string }> }).data ?? [];
  for (const u of users) {
    if (u.userid?.startsWith(E2E_PREFIX)) {
      await pmg.accessUsers().deleteUsers({ userid: u.userid }).catch(() => undefined);
    }
  }
}

async function cleanupDomains(pmg: Pmg): Promise<void> {
  const res = await pmg.configDomains().getDomains();
  const domains = (res as { data?: Array<{ domain?: string }> }).data ?? [];
  for (const d of domains) {
    if (d.domain?.endsWith(E2E_DOMAIN_SUFFIX)) {
      await pmg.configDomains().deleteDomains({ domain: d.domain }).catch(() => undefined);
    }
  }
}

/**
 * Read the first node hostname from `/nodes`. The PMG test container
 * runs a single node; calling this once per suite avoids hardcoding
 * `pmg-test`.
 */
export async function firstNode(pmg: Pmg): Promise<string> {
  const res = await pmg.nodes().getNodes();
  const nodes = (res as { data?: Array<{ name?: string; node?: string }> }).data ?? [];
  // PMG's /nodes returns `{ name, ... }` (no `node` field like PVE/PBS).
  const first = nodes[0]?.node ?? nodes[0]?.name;
  if (!first) throw new Error('No nodes returned from /nodes: ' + JSON.stringify(res));
  return first;
}
