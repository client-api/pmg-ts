/**
 * Example: connect to a Proxmox host with a self-signed certificate.
 *
 * The PVE web UI ships with a self-signed cert by default. Production
 * setups should use a real CA-signed cert (Let's Encrypt via the
 * Proxmox UI), but home-lab and dev setups commonly need to opt out
 * of cert verification.
 *
 * **Security note:** disabling verification is vulnerable to MITM. Use
 * only on trusted networks, or pin the cert fingerprint instead.
 *
 * Run with:
 *   PMG_HOST=https://pmg.example.com:8006 \
 *   PMG_TOKEN='PMGAPIToken=root@pam!auto=...' \
 *   PMG_NODE=orca PMG_VMID=100 \
 *   npx tsx examples/insecure-tls.ts
 *
 * Requires: `npm i undici ws @types/ws` (auto-added by sdk-bootstrap).
 */

import { Agent as UndiciAgent } from 'undici';
import * as WS from 'ws';
const WebSocketImpl = (WS as any).default ?? WS;
import { Configuration, Pmg, connectTerminal } from '../src';

// ── 2. WebSocket: Node's built-in `globalThis.WebSocket` (WHATWG-spec)
//    can't carry custom headers (we need `Authorization` for API
//    tokens) and has no per-connection TLS opts (we need to skip
//    cert verification). The `ws` package supports both — substitute
//    it as the global before the SDK touches it. The SDK calls
//    `new globalThis.WebSocket(url, undefined, { headers })`; we
//    extend the options bag with `rejectUnauthorized: false`.
const InsecureWebSocket = new Proxy(WebSocketImpl, {
    construct(target, args) {
        const [url, protocols, opts] = args as [string, undefined, Record<string, unknown>?];
        return new target(url, protocols, { ...(opts ?? {}), rejectUnauthorized: false });
    },
}) as unknown as typeof WebSocket;
(globalThis as any).WebSocket = InsecureWebSocket;

async function main() {
    const token = process.env.PMG_TOKEN ?? '';
    const host = process.env.PMG_HOST ?? 'https://localhost:8006';

    // ── 1. HTTP: Node's built-in fetch is undici-based; per-request
    //    TLS opts go through `dispatcher`, not the legacy `agent`
    //    (which is silently ignored). An undici Agent with
    //    `connect.rejectUnauthorized = false` skips cert verification
    //    for self-signed PVE hosts.
    const dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
    const insecureFetch: typeof fetch = (input, init) =>
        fetch(input, { ...init, ...({ dispatcher } as object) });

    const config = new Configuration({
        basePath: `${host}/api2/json`,
        // apiKey is called per security scheme; supply the token for
        // the Authorization slot.
        apiKey: (name) => (name === 'Authorization' ? token : ''),
        fetchApi: insecureFetch as any,
    });
    const pmg = new Pmg(config);

    const nodes = (await pmg.nodes().getNodes()).data ?? [];
    console.log(`Connected (insecure TLS): ${nodes.length} node(s)`);
    for (const n of nodes) {
        console.log(`  - ${n.node} (status=${n.status})`);
    }

    if (!process.env.PMG_NODE || !process.env.PMG_VMID) {
        console.log('(skip terminal: set PMG_NODE and PMG_VMID to test the WebSocket leg)');
        return;
    }

    console.log(`Opening terminal to ${process.env.PMG_NODE}/qemu/${process.env.PMG_VMID}...`);
    const session = await connectTerminal(
        config,
        {
            kind: 'qemu',
            node: process.env.PMG_NODE,
            vmid: Number(process.env.PMG_VMID),
        },
        {
            onMessage: (text) => process.stdout.write(text),
            onClose: (ev) => console.log(`\n[ws close] code=${(ev as any)?.code}`),
            onError: (ev) => console.error('\n[ws error]', (ev as any)?.message ?? ev),
        },
    );

    session.send('\n');
    await new Promise((r) => setTimeout(r, 800));
    session.send('uname -a\n');
    await new Promise((r) => setTimeout(r, 3000));
    session.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
