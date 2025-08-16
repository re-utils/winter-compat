import type { RequestHandler, ServeOptions } from './types.ts';

export interface DenoRequest extends Request {
  readonly _info: Deno.ServeHandlerInfo<Deno.NetAddr>;
}

export const requestIP = (req: Request): string =>
  (req as DenoRequest)._info.remoteAddr.hostname;

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Deno.HttpServer<Deno.NetAddr> =>
  Deno.serve(options ?? {}, (req, info) => {
    // @ts-ignore
    req._info = info;
    return fetch(req);
  });
