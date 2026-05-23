# @clientapi/pmg

TypeScript SDK for the Proxmox Mail Gateway API. Generated
from the upstream `apidoc.js` from Proxmox Mail Gateway via [openapi-generator-cli][gen] with
custom Mustache template overrides.

> **Not an official Proxmox project.** Community SDK derived from the
> upstream `apidoc.js`. Always verify against the upstream API viewer.
> <https://pmg.proxmox.com/>.

## Install

```bash
npm install @clientapi/pmg
# or
pnpm add @clientapi/pmg
```

## Usage

```ts
import { Configuration, Pmg } from '@clientapi/pmg';

const cfg = new Configuration({
  basePath: 'https://pmg1.example.com:8006/api2/json',
  apiKey: 'PMGAPIToken=user@realm!tokenid=uuid-secret',
});
const pmg = new Pmg(cfg);

// Per-tag accessors are lazily instantiated and share the same Configuration.
// `removeOperationIdPrefix=true` strips the tag prefix from method names,
// so the call is `pmg.qemu().vmStatus(...)`, not `qemuVmStatus(...)` —
// you're already inside the `qemu` namespace.
const status = await pmg.qemu().vmStatus({ node: 'pmg1', vmid: 100 });
const nodes = await pmg.nodes().getNodes();
```

The unified `Pmg` class wraps each per-tag API class
(`QemuApi`, `LxcApi`, `ClusterApi`, `NodesApi`, …) so consumers don't
need to instantiate them individually.

## Compound configs

PVE encodes many fields as CLI-style shorthand strings
(`net0=virtio,bridge=vmbr0,firewall=1`). Round-trip helpers are
emitted for every compound config schema:

```ts
import { PveQemuNetConfigToShorthand, PveQemuNetConfigFromShorthand } from '@clientapi/pmg';

const shorthand = PveQemuNetConfigToShorthand({
  model: 'virtio',
  bridge: 'vmbr0',
  firewall: 1,
});
// → 'virtio,bridge=vmbr0,firewall=1'

const parsed = PveQemuNetConfigFromShorthand(shorthand);
```

## Indexed families

Numbered properties (`net0..net31`, `mp0..mp255`, …) are exposed on
every model as a single collapsed `nets` / `mps` / … field:

```ts
const req = {
  nets: {
    0: 'virtio,bridge=vmbr0',
    3: 'e1000,bridge=vmbr1',
  },
};
// Wire format: { net0: 'virtio,bridge=vmbr0', net3: 'e1000,bridge=vmbr1' }
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).

[gen]: https://openapi-generator.tech
