/**
 * Example: open a terminal session against a QEMU VM and run a command.
 *
 * Run with:
 *   PMG_HOST=https://pmg.example.com:8006 \
 *   PMG_TOKEN='PMGAPIToken=root@pam!auto=...' \
 *   PMG_NODE=orca PMG_VMID=100 \
 *   npx tsx examples/terminal.ts
 */

import { Configuration, Pmg } from '../src';

async function main() {
    const token = process.env.PMG_TOKEN ?? '';
    const config = new Configuration({
        basePath: `${process.env.PMG_HOST ?? 'https://localhost:8006'}/api2/json`,
        apiKey: (name) => (name === 'Authorization' ? token : ''),
    });
    const pmg = new Pmg(config);
    const node = process.env.PMG_NODE ?? 'pmg1';
    const vmid = Number(process.env.PMG_VMID ?? 100);

    console.log(`Opening terminal on ${node}:qemu/${vmid}...`);
    const session = await pmg.connectTerminal(
        { kind: 'qemu', node, vmid },
        {
            onMessage: (text) => process.stdout.write(text),
            onClose: (event) => console.log(`\n[closed: ${event.code} ${event.reason}]`),
            onError: (event) => console.error(`\n[error: ${event}]`),
        },
    );

    // Resize the pty to a sensible size and run a single command.
    session.resize(120, 32);
    session.send('uname -a\n');

    // Read for 5 seconds, then close.
    await new Promise((r) => setTimeout(r, 5000));
    session.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
