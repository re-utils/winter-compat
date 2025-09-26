import type { RequestHandler, ServeOptions } from './types.ts';

export interface DenoRequest extends Request {
  _: Deno.ServeHandlerInfo<Deno.NetAddr>;
}

export const requestIP = (req: Request): string =>
  (req as DenoRequest)._.remoteAddr.hostname;

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Deno.HttpServer<Deno.NetAddr> =>
  Deno.serve(options ?? {}, (req, info) => {
    (req as DenoRequest)._ = info;
    return fetch(req);
  });
