import { Pmg } from '../../src/Pmg';
import { Configuration } from '../../src/runtime';
import type { Credentials } from './credentials';

/**
 * PMG (like PVE) serves its REST API under `/api2/json`. PDM uses
 * `/api2/extjs`. Centralising the prefix keeps the per-product swap a
 * one-line edit between sister repos.
 */
const API_PATH_PREFIX = '/api2/json';

/**
 * PMG cookie name. Differs from PVE (`PVEAuthCookie`) and PBS
 * (`PBSAuthCookie`); the credentials file's `token_header_value` would
 * carry the right prefix — but PMG 9.x has no token API at all, so
 * `createTokenClient` is only useful as a smoke probe and the rest of
 * the suite must use ticket auth.
 */
const AUTH_COOKIE_NAME = 'PMGAuthCookie';

/**
 * Build an SDK client that authenticates via an API token.
 *
 * PMG 9.x doesn't actually issue tokens (the `/access/users/{id}/token`
 * endpoint doesn't exist). The container ships
 * `token_value: "(unsupported-by-pmg)"` as a sentinel so SC-12/SC-13
 * skip themselves via `tokenAuthSupported(creds)` — see
 * `e2e/helpers/credentials.ts`.
 */
export function createTokenClient(creds: Credentials): Pmg {
  return new Pmg(
    new Configuration({
      basePath: creds.url + API_PATH_PREFIX,
      apiKey: (name: string) => {
        if (name === 'Authorization') return creds.tokenHeaderValue;
        return '';
      },
    }),
  );
}

export interface TicketSession {
  pmg: Pmg;
  ticket: string;
  csrfToken: string;
}

/**
 * Build an SDK client that authenticates via a ticket + CSRF token pair
 * from `POST /access/ticket`. **This is the default auth path for the
 * PMG suite** because tokens aren't supported.
 */
export async function createTicketSession(creds: Credentials): Promise<TicketSession> {
  const bootstrap = new Pmg(new Configuration({ basePath: creds.url + API_PATH_PREFIX }));
  const res = await bootstrap.accessTicket().createTicket({
    accessTicketCreateTicketRequest: {
      username: creds.user,
      password: creds.password,
    },
  });
  const ticket = res.data?.ticket;
  // Generator lower-cases the leading C in `CSRFPreventionToken`.
  const csrf = res.data?.cSRFPreventionToken;

  if (!ticket || !csrf) {
    throw new Error('Ticket login returned no ticket / CSRF token: ' + JSON.stringify(res));
  }

  // Set Cookie + CSRFPreventionToken as default headers rather than via
  // the apiKey callback. The generated APIs blindly assign
  // `Authorization = apiKey('Authorization')` — returning `''` from the
  // callback writes an empty Authorization header which PMG 401s.
  const pmg = new Pmg(
    new Configuration({
      basePath: creds.url + API_PATH_PREFIX,
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${ticket}`,
        CSRFPreventionToken: csrf,
      },
    }),
  );
  return { pmg, ticket, csrfToken: csrf };
}

/**
 * Expose the SDK's basePath + auth callback to helpers that need raw
 * fetch (e.g. endpoints where the generator drops wire-required fields).
 */
export function configFor(pmg: Pmg): {
  basePath: string;
  authHeader: () => Promise<string>;
} {
  const cfg = pmg.configuration();
  return {
    basePath: cfg.basePath,
    authHeader: async () => {
      const cb = cfg.apiKey;
      if (!cb) throw new Error('SDK configuration has no apiKey callback');
      return cb('Authorization');
    },
  };
}

export { AUTH_COOKIE_NAME };
