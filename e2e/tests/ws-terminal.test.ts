import { describe, test, expect, beforeAll } from 'vitest';

import { loadCredentials, type Credentials } from '../helpers/credentials';
import { createTicketSession } from '../helpers/client';
import { openNodeTerminal } from '../helpers/terminal';
import { firstNode } from '../helpers/fixtures';

const WS_TIMEOUT = 30_000;

/**
 * WS-01 (extra) — `termproxy` against the **PMG node shell**.
 *
 * The PMG SDK doesn't ship a built-in WebSocket helper (same as PBS).
 * Wire protocol is identical to PVE/PBS termproxy; the only
 * product-specific bit is `PMGAuthCookie` as the cookie name.
 */
describe('ws-terminal', () => {
  let creds: Credentials;

  beforeAll(() => {
    creds = loadCredentials();
  });

  test(
    'WS-01: PMG node terminal opens, echoes a marker, closes',
    async () => {
      const session = await createTicketSession(creds);
      const node = await firstNode(session.pmg);

      const shell = await openNodeTerminal(
        session.pmg,
        node,
        creds,
        session.ticket,
        session.csrfToken,
      );

      await new Promise((r) => setTimeout(r, 500));

      const marker = `e2e-ws-${Date.now()}`;
      shell.send(`echo ${marker}\n`);

      const start = Date.now();
      while (Date.now() - start < WS_TIMEOUT) {
        if (shell.output().includes(marker)) break;
        await new Promise((r) => setTimeout(r, 100));
      }

      expect(shell.output()).toContain(marker);

      shell.close();
    },
    WS_TIMEOUT + 5_000,
  );
});
