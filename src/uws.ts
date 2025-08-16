import { App, type HttpRequest, type HttpResponse } from 'uWebSockets.js';
import type { RequestHandler, ServeOptions } from './types.ts';
import {
  methodNotImplemented,
  notImplementedGetters,
  useRequestBody,
} from './utils.ts';

export const _readBody = (
  req: _uRequest,
): Promise<Uint8Array<ArrayBuffer>[]> => {
  useRequestBody(req);

  return new Promise((res) => {
    const bufs: Uint8Array<ArrayBuffer>[] = [];

    req._res.onData((ab, isLast) => {
      bufs.push(new Uint8Array(ab.slice()));
      isLast && res(bufs);
    });
  });
};

export class _uHeaders implements Headers {
  _req: HttpRequest;

  // Absolutely no modifying the request headers
  getSetCookie: any;
  set: any;
  count: any;
  append: any;
  delete: any;

  constructor(req: HttpRequest) {
    this._req = req;
    this.set =
      this.append =
      this.delete =
      this.getSetCookie =
      this.count =
        methodNotImplemented;
  }

  get(name: string): string | null {
    return this._req.getHeader(name.toLowerCase()) || null;
  }

  getAll(name: string): string[] {
    name = name.toLowerCase();
    const val = this._req.getHeader(name);
    return val === '' ? [] : val.split(name === 'cookie' ? '; ' : ',');
  }

  has(name: string): boolean {
    return this._req.getHeader(name) !== '';
  }

  toJSON(): Record<string, string> {
    const result: Record<string, string> = {};
    this._req.forEach((k, v) => {
      result[k] = v;
    });
    return result;
  }

  forEach(
    cb: (value: string, key: string, parent: Headers) => void,
    thisArg?: any,
  ): void {
    this._req.forEach((k, v) => cb(k, v, this));
  }

  *keys(): HeadersIterator<string> {
    const vals: string[] = [];
    this._req.forEach((k) => {
      vals.push(k);
    });
    yield* vals;
  }

  *values(): HeadersIterator<string> {
    const vals: string[] = [];
    this._req.forEach((_, v) => {
      vals.push(v);
    });
    yield* vals;
  }

  *entries(): HeadersIterator<[string, string]> {
    const vals: [string, string][] = [];
    this._req.forEach((k, v) => {
      vals.push([k, v]);
    });
    yield* vals;
  }

  [Symbol.iterator](): HeadersIterator<[string, string]> {
    return this.entries();
  }
}

export class _uRequest implements Request {
  readonly _req: HttpRequest;
  readonly _res: HttpResponse;
  readonly _aborted: boolean;

  readonly method: string;
  readonly url: string;
  readonly bodyUsed: boolean;

  constructor(res: HttpResponse, req: HttpRequest) {
    this._res = res;
    this._req = req;

    this.method = req.getCaseSensitiveMethod();

    const query = req.getQuery();
    this.url =
      (req.getHeader('x-forwarded-proto') === 'https'
        ? 'https://'
        : 'http://') +
      req.getHeader('host') +
      req.getUrl() +
      (query === '' ? '' : '?' + query);
    this.bodyUsed = false;

    this._aborted = false;
    this._res.onAborted(() => {
      // @ts-ignore
      this._aborted = true;
    });
  }

  clone(): Request {
    return new _uRequest(this._res, this._req);
  }

  #headers?: _uHeaders;
  get headers(): Headers {
    return (this.#headers ??= new _uHeaders(this._req));
  }

  #signal?: AbortSignal;
  get signal(): AbortSignal {
    if (this.#signal != null) return this.#signal;

    const controller = new AbortController();
    this._res.onAborted(() => {
      // @ts-ignore
      this._aborted = true;
      controller.abort();
    });

    return (this.#signal = controller.signal);
  }

  #bodyStream?: ReadableStream<Uint8Array<ArrayBuffer>>;
  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null {
    if (this.#bodyStream != null) return this.#bodyStream;

    if (this.bodyUsed) return null;
    // @ts-ignore
    this.bodyUsed = true;

    return (this.#bodyStream = new ReadableStream({
      start: (c) => {
        this._res.onData((ab, isLast) => {
          c.enqueue(new Uint8Array(ab.slice()));
          isLast && c.close();
        });
      },
    }));
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(Buffer.concat(await _readBody(this)));
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return Buffer.concat(await _readBody(this)).buffer;
  }

  async blob(): Promise<Blob> {
    return new Blob(await _readBody(this), {
      type: this._req.getHeader('content-type'),
    });
  }

  async formData(): Promise<FormData> {
    const headers: [string, string][] = [];
    this._req.forEach((k, v) => {
      headers.push([k, v]);
    });

    return new Response(Buffer.concat(await _readBody(this)), {
      headers,
    }).formData();
  }

  async json<T>(): Promise<T> {
    return JSON.parse(Buffer.concat(await _readBody(this)).toString());
  }

  async text(): Promise<string> {
    return Buffer.concat(await _readBody(this)).toString();
  }

  // Umimplemented
  declare readonly cache: RequestCache;
  declare readonly credentials: RequestCredentials;
  declare readonly destination: RequestDestination;
  declare readonly integrity: string;
  declare readonly keepalive: boolean;
  declare readonly mode: RequestMode;
  declare readonly redirect: RequestRedirect;
  declare readonly referrer: string;
  declare readonly referrerPolicy: ReferrerPolicy;
}

notImplementedGetters(
  _uRequest,
  'cache',
  'credentials',
  'destination',
  'integrity',
  'keepalive',
  'mode',
  'redirect',
  'referrer',
  'referrerPolicy',
);

const decoder = new TextDecoder();
export const requestIP = (req: Request): string | undefined => {
  const buf = (req as _uRequest)._res.getRemoteAddressAsText();
  if (buf.byteLength > 0) return decoder.decode(buf);
};

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const host = options?.hostname ?? '127.0.0.1';
    const port = options?.port ?? 3000;

    App()
      .any('/*', async (res, req) => {
        const webReq = new _uRequest(res, req);

        let webRes = fetch(webReq);
        if (webRes instanceof Promise) {
          webRes = await webRes;
          if (webReq._aborted) return;
        }

        if (webRes instanceof Response) {
          // Write headers
          webRes.headers.forEach((val, key) => {
            if (key === 'set-cookie')
              for (
                let i = 0, cookies = webRes.headers.getSetCookie();
                i < cookies.length;
                i++
              )
                res.writeHeader('set-cookie', cookies[i]);
            else res.writeHeader(key, val);
          });
          res.writeStatus(webRes.status + ' ' + webRes.statusText);

          // Write body
          if (webRes.body != null) {
            const reader = webRes.body.getReader();

            try {
              let it = await reader.read();

              while (!it.done) {
                if (webReq._aborted) return;
                if (it.done) break;

                res.write(it.value);
                it = await reader.read();
              }

              res.end();
            } catch (e) {
              // Abort on error
              res.close();
              return Promise.reject(e);
            }
          } else res.end();
        } else {
          res.writeStatus('204 No Content');
          res.end();
        }
      })
      .listen(host, port, (s) => {
        s === false
          ? reject(
              new Error(
                'Server failed to start! is http://' +
                  host +
                  ':' +
                  port +
                  ' in use?',
              ),
            )
          : resolve();
      });
  });
