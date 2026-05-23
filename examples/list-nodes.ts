/**
 * Example: list cluster nodes.
 *
 * Run with:
 *   PMG_HOST=https://pmg.example.com:8006 \
 *   PMG_TOKEN='PMGAPIToken=root@pam!auto=...' \
 *   npx tsx examples/list-nodes.ts
 */

import { Configuration, Pmg } from '../src';

async function main() {
    const token = process.env.PMG_TOKEN ?? '';
    const config = new Configuration({
        basePath: `${process.env.PMG_HOST ?? 'https://localhost:8006'}/api2/json`,
        // apiKey is called per security scheme (`Authorization`,
        // `PMGAuthCookie`, `CSRFPreventionToken`); supply the token
        // for the Authorization slot.
        apiKey: (name) => (name === 'Authorization' ? token : ''),
    });
    const pmg = new Pmg(config);

    const result = await pmg.nodes().getNodes();
    const nodes = result.data ?? [];
    console.log(`Found ${nodes.length} node(s):`);
    for (const node of nodes) {
        console.log(`  - ${node.node} (status=${node.status}, cpu=${node.cpu}, mem=${node.mem}/${node.maxmem})`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
