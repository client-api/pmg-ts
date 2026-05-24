# E2E tests — TypeScript × PMG

This suite drives the generated SDK in `src/` against a real Proxmox
Mail Gateway container. It implements the `SC-NN` scenarios from
[`pve-openapi/docs/E2E_TEST_PLAN.md` §5](https://github.com/bencurio/pve-openapi/blob/main/docs/E2E_TEST_PLAN.md#5-test-scenario-specification),
with PMG-incompatible scenarios omitted: PMG 9.x has no token API
(SC-12/SC-13 skip via the `(unsupported-by-pmg)` sentinel), no ACL API
(SC-33 omitted), no datastores (SC-32 substituted with relay-domain
CRUD), and no VMs/containers (SC-35, SC-60..62 omitted).

## Layout

```
e2e/
├── helpers/
│   ├── credentials.ts      # PROXMOX_* env -> typed Credentials
│   ├── client.ts           # SDK client factory (ticket only — no tokens)
│   ├── capability-gate.ts  # KVM, cgroupv2, network skip flags
│   ├── fixtures.ts         # e2e-* cleanup (users + relay domains)
│   ├── raw.ts              # raw-fetch escape hatch (auth reused from SDK)
│   ├── terminal.ts         # WebSocket node-shell wire protocol
│   └── poll.ts             # waitUntil(predicate, timeoutMs)
└── tests/
    ├── version.test.ts     # SC-01
    ├── auth.test.ts        # SC-10..14 (SC-12/13 skip on PMG)
    ├── authz.test.ts       # SC-20..22 (role-on-user, not ACL)
    ├── crud.test.ts        # SC-30..34 (domains for SC-32; SC-33 omitted)
    ├── errors.test.ts      # SC-40..41 (SC-42 omitted — no token API)
    ├── types.test.ts       # SC-50..52
    └── ws-terminal.test.ts # WS-01  (extra — node-shell over WS)
```

### Scenarios omitted

| SC          | Why omitted on PMG                                                    |
|-------------|-----------------------------------------------------------------------|
| SC-12, 13   | PMG 9.x has no token API. The credentials JSON carries the sentinel `token_value: "(unsupported-by-pmg)"`; `tokenAuthSupported(creds)` returns `false` and `test.skipIf(...)` does the rest. |
| SC-33       | PMG has no ACL API. Privilege is on the user record's `role` field — exercised by SC-21/SC-22 instead. |
| SC-35       | ISO upload — PVE-only surface.                                        |
| SC-42       | Privsep-token denial — no token API to scope.                         |
| SC-60..62   | VM/CT lifecycle — PMG has no `/qemu` or `/lxc` API.                   |

### Per-product differences from pve-ts

- **Auth path**: ticket only — PMG has no tokens. `createTokenClient` is
  exported for symmetry but doesn't authenticate.
- **Cookie name**: `PMGAuthCookie` (centralised in
  `e2e/helpers/client.ts:AUTH_COOKIE_NAME`).
- **Token sentinel**: `(unsupported-by-pmg)` in
  `PROXMOX_TOKEN_VALUE` triggers SC-12/SC-13 skips.
- **Port**: `8006` (same as PVE — they never co-exist on one host).
- **User API**: methods named `createUsers` / `deleteUsers` (plural).
- **Role on user**: PMG stores privilege on the user record itself (one
  of `root`, `admin`, `helpdesk`, `qmanager`, `audit`).
- **`PmgBoolean`**: `0|1` enum, but PMG wire encodes it as a string
  ("1") rather than a JSON number; the SDK doesn't coerce. SC-22
  accepts both shapes — tracked upstream.

### Known SDK issues surfaced by this suite

| Test                                  | Bug                                                                                                | Where                                       |
|---------------------------------------|----------------------------------------------------------------------------------------------------|---------------------------------------------|
| `types.test.ts` `SC-50`               | `int64` deserialised as `number` (silent truncation hazard above 2^53). Should be `bigint`.        | OpenAPI generator typescript-fetch template.|
| `authz.test.ts` `SC-22`               | `PmgBoolean` fields ship as wire-encoded strings (`"1"`) instead of JSON numbers; SDK doesn't coerce. | OpenAPI generator typescript-fetch template / upstream PMG OpenAPI spec. |

The PMG SDK has **no built-in WebSocket helper** (same as PBS), so
WS-01 uses `e2e/helpers/terminal.ts` directly.

## Running locally

```sh
docker compose up -d
docker compose ps                          # wait for "healthy"

CREDS=$(docker exec pmg-test cat /run/credentials.json)
export PROXMOX_URL=https://localhost:8006
export PROXMOX_USER=$(jq -r .user <<<"$CREDS")
export PROXMOX_PASSWORD=$(jq -r .password <<<"$CREDS")
export PROXMOX_TOKEN_HEADER_VALUE=$(jq -r .token_header_value <<<"$CREDS")
export PROXMOX_TOKEN_VALUE=$(jq -r .token_value <<<"$CREDS")
export PROXMOX_KVM_AVAILABLE=false         # PMG doesn't need /dev/kvm
export PROXMOX_CGROUPV2_AVAILABLE=false
export NODE_TLS_REJECT_UNAUTHORIZED=0

pnpm install
pnpm test:e2e
```

## Running in CI

`.github/workflows/e2e.yml` uses `client-api/proxmox-docker-action@v1`
with `product: pmg, tag: '9.0'` to start the container, export the env
vars, and clean up. The PMG sentinel `PROXMOX_TOKEN_VALUE` ensures
SC-12/SC-13 skip cleanly.

## Hard rules

- **Never reconstruct the API token header by hand.** Read
  `PROXMOX_TOKEN_HEADER_VALUE` whole — PMG uses `=` between tokenid and
  secret (Perl family, like PVE) while PBS/PDM use `:` (Rust family).
  The credentials JSON has the right format baked in. On PMG the value
  is the sentinel `(unsupported-by-pmg)`, but the suite still reads it
  whole for shape parity with the other products.
- **bigint fields must round-trip losslessly.** Use `BigInt`; if the SDK
  truncates to `Number`, file an issue in `pve-openapi` — don't patch
  the SDK here.
- **No imports outside this repo.** Each downstream SDK ships its own copy.
