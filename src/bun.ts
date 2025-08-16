import type { RequestHandler, ServeOptions } from './types.ts';

export interface BunRequest extends Request {
  readonly _server: Bun.Server;
}

export const requestIP = (req: Request): string | undefined =>
  (req as BunRequest)._server.requestIP(req)?.address;

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Bun.Server =>
  Bun.serve({
    ...options,
    fetch: (req, server) => {
      // @ts-ignore
      req._server = server;
      return fetch(req);
    },
  });
