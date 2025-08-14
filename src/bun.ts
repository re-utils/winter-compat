import config from './config.ts';
import type { ServeOptions } from './types.ts';

export interface BunRequest extends Request {
  readonly _server: Bun.Server;
}

export const requestIP = (req: BunRequest): string | undefined | null =>
  req._server.requestIP(req)?.address;

export { noop as waitUntil } from './utils.ts';

export const serve = (options: ServeOptions): Bun.Server => {
  const fetch = options.fetch;
  return Bun.serve({
    ...options,
    ...config,
    fetch: (req, server) => {
      // @ts-ignore
      req._server = server;
      return fetch(req);
    },
  });
};
