import type { RequestHandler, ServeOptions } from './types.ts';

export interface BunRequest extends Request {
  _: Bun.Server;
}

export const requestIP = (req: Request): string | undefined =>
  (req as BunRequest)._.requestIP(req)?.address;

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Bun.Server =>
  Bun.serve({
    ...options,
    fetch: (req, server) => {
      (req as BunRequest)._ = server;
      return fetch(req);
    },
  });
