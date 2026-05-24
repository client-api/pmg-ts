import { WebSocket as NodeWebSocket } from 'ws';

import type { Pmg } from '../../src/Pmg';
import { AUTH_COOKIE_NAME } from './client';
import type { Credentials } from './credentials';

/**
 * Open a PMG node-shell terminal over WebSocket.
 *
 * The PMG SDK doesn't ship a built-in WebSocket helper. PMG uses the
 * same `termproxy` family as PVE/PBS (`/nodes/{node}/termproxy` →
 * `/nodes/{node}/vncwebsocket`) and the same text-framed protocol —
 * the only product-specific bit is the `PMGAuthCookie` name.
 *
 * Wire protocol:
 *   1. POST {basePath}/nodes/{node}/termproxy → `{ ticket, port, user }`
 *   2. Open `wss://host/api2/json/nodes/{node}/vncwebsocket?port=N&vncticket=…`
 *      with the `PMGAuthCookie` cookie set as a request header.
 *   3. First frame: raw `${user}:${vncticket}\n` (in-band auth).
 *   4. Subsequent input frames: `0:LEN:MSG\n`.
 */
export interface TerminalShell {
  send(text: string): void;
  close(): void;
  output(): string;
}

const HANDSHAKE_TIMEOUT_MS = 10_000;

export async function openNodeTerminal(
  pmg: Pmg,
  node: string,
  _creds: Credentials,
  ticketCookie: string,
  csrfToken: string,
): Promise<TerminalShell> {
  const { basePath } = pmg.configuration();

  const termproxyRes = await fetch(`${basePath}/nodes/${encodeURIComponent(node)}/termproxy`, {
    method: 'POST',
    headers: {
      Cookie: `${AUTH_COOKIE_NAME}=${ticketCookie}`,
      CSRFPreventionToken: csrfToken,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!termproxyRes.ok) {
    throw new Error(`termproxy failed: HTTP ${termproxyRes.status} ${await termproxyRes.text()}`);
  }
  const { data } = (await termproxyRes.json()) as {
    data: { ticket: string; port: string; user: string };
  };

  const wsBase = basePath.replace(/^http(s?):/, (_, s) => `ws${s}:`);
  const url = new URL(`${wsBase}/nodes/${encodeURIComponent(node)}/vncwebsocket`);
  url.searchParams.set('port', String(data.port));
  url.searchParams.set('vncticket', data.ticket);

  const socket = new NodeWebSocket(url.toString(), {
    headers: { Cookie: `${AUTH_COOKIE_NAME}=${ticketCookie}` },
    rejectUnauthorized: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timed out')), HANDSHAKE_TIMEOUT_MS);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.once('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket closed before open: code=${code}`));
    });
  });

  socket.send(`${data.user}:${data.ticket}\n`);

  const buf: string[] = [];
  socket.on('message', (chunk) => {
    buf.push(chunk.toString('utf8'));
  });

  return {
    send(text: string) {
      socket.send(`0:${text.length}:${text}\n`);
    },
    close() {
      try {
        socket.close(1000, 'client closed');
      } catch {
        // ignore
      }
    },
    output() {
      return buf.join('');
    },
  };
}
