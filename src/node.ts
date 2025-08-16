import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeader,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import type { RequestHandler, ServeOptions } from './types.ts';
import {
  joinHeaders,
  methodNotImplemented,
  notImplementedGetters,
  useRequestBody,
} from './utils.ts';

export const _readBody = (
  req: _NodeRequest,
): Promise<Buffer<ArrayBuffer>[]> => {
  useRequestBody(req);
  return new Promise((res, rej) => {
    const chunks: Buffer<ArrayBuffer>[] = [];
    const bodyStream = req._req;

    req._abort != null && bodyStream.once('error', req._abort);

    bodyStream
      .on('data', (chunk: Buffer<ArrayBuffer>) => {
        chunks.push(chunk);
      })
      .once('end', () => {
        res(chunks);
      })
      .once('error', rej);
  });
};

export class _NodeHeaders implements Headers {
  _req: IncomingMessage;

  // Absolutely no modifying the request headers
  getSetCookie: any;
  set: any;
  count: any;
  append: any;
  delete: any;

  constructor(req: IncomingMessage) {
    this._req = req;
    this.set =
      this.append =
      this.delete =
      this.getSetCookie =
      this.count =
        methodNotImplemented;
  }

  get(name: string): string | null {
    name = name.toLowerCase();

    const val = this._req.headers[name];
    if (val == null) return null;
    if (typeof val === 'string') return val;

    return val.join(name === 'cookie' ? '; ' : ', ');
  }

  getAll(name: string): string[] {
    const val = this._req.headers[name.toLowerCase()];
    return val == null ? [] : typeof val === 'string' ? [val] : val;
  }

  has(name: string): boolean {
    return name.toLowerCase() in this._req.headers;
  }

  toJSON(): Record<string, string> {
    const headers = this._req.headers;
    const result: Record<string, string> = {};
    for (const key in headers)
      if (headers[key] != null) result[key] = joinHeaders(headers[key]);
    return result;
  }

  forEach(
    cb: (value: string, key: string, parent: Headers) => void,
    thisArg?: any,
  ): void {
    const headers = this._req.headers;
    for (const key in headers)
      if (headers[key] != null)
        cb.call(thisArg, joinHeaders(headers[key]), key, this as any);
  }

  *keys(): HeadersIterator<string> {
    const vals = Object.keys(this._req.headers);
    for (let i = 0; i < vals.length; i++) if (vals[i][0] !== ':') yield vals[i];
  }

  *values(): HeadersIterator<string> {
    const vals = Object.values(this._req.headers);
    for (let i = 0; i < vals.length; i++)
      if (vals[i] != null) yield joinHeaders(vals[i]!);
  }

  *entries(): HeadersIterator<[string, string]> {
    const headers = this._req.headers;

    for (const key in headers) {
      if (headers[key] != null) yield [key, joinHeaders(headers[key])];
    }
  }

  [Symbol.iterator](): HeadersIterator<[string, string]> {
    return this.entries();
  }
}

export class _NodeRequest implements Request {
  readonly _req: IncomingMessage;

  readonly url: string;
  readonly method: string;
  readonly bodyUsed: boolean;

  constructor(req: IncomingMessage) {
    this._req = req;

    // Don't lazy load common stuff
    this.url =
      (req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') +
      (req.headers.host ?? req.headers[':authority']) +
      req.url!;
    this.method = this._req.method!;
    this.bodyUsed = false;
  }

  _abort?: () => void;
  #signal?: AbortSignal;
  get signal(): AbortSignal {
    if (this.#signal != null) return this.#signal;

    const controller = new AbortController();
    this._req.once(
      'close',
      (this._abort = () => {
        controller.abort();
      }),
    );

    return (this.#signal = controller.signal);
  }

  clone(): Request {
    return new _NodeRequest(this._req);
  }

  #headers?: _NodeHeaders;
  get headers(): Headers {
    return (this.#headers ??= new _NodeHeaders(this._req));
  }

  #bodyStream?: ReadableStream<Uint8Array<ArrayBuffer>>;
  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null {
    if (this.#bodyStream != null) return this.#bodyStream;

    if (this.bodyUsed) return null;
    // @ts-ignore Well I can't handle this correctly
    this.bodyUsed = true;

    const bodyStream = this._req;
    if (this._abort != null) bodyStream.once('error', this._abort);

    return (this.#bodyStream = Readable.toWeb(bodyStream) as any);
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(Buffer.concat(await _readBody(this)));
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return Buffer.concat(await _readBody(this)).buffer;
  }

  async blob(): Promise<Blob> {
    return new Blob(await _readBody(this), {
      type: this._req.headers['content-type'],
    });
  }

  async formData(): Promise<FormData> {
    return new Response(Buffer.concat(await _readBody(this)), {
      headers: this._req.headers as Record<string, string>,
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
  _NodeRequest,
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

export const _sendResponse = (nodeRes: ServerResponse, res: any): void => {
  if (res instanceof Response) {
    // Write headers
    const headers: OutgoingHttpHeader[] = [];

    res.headers.forEach((val, key) => {
      if (key === 'set-cookie')
        for (let i = 0, cookies = val.split(', '); i < cookies.length; i++)
          headers.push(['set-cookie', cookies[i]]);
      else headers.push([key, val]);
    });

    nodeRes.writeHead(res.status, res.statusText, headers);

    // Write body
    if (res.body != null) {
      if (nodeRes.destroyed) res.body.cancel();
      else Readable.fromWeb(res.body as any).pipe(nodeRes);
    } else nodeRes.end();
  } else {
    // Matching Bun behavior ig
    nodeRes.statusCode = 204;
    nodeRes.end();
  }
};

export const _sendResponseAsync = async (
  nodeRes: ServerResponse,
  res: Promise<any>,
): Promise<void> => {
  _sendResponse(nodeRes, await res);
};

export const requestIP = (req: Request): string | undefined =>
  (req as _NodeRequest)._req.socket.remoteAddress;

export { noop as waitUntil } from './utils.ts';

export const serve = (
  fetch: RequestHandler,
  options?: ServeOptions,
): Promise<Server> =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const webRes = fetch(new _NodeRequest(req));
      (webRes instanceof Promise ? _sendResponseAsync : _sendResponse)(
        res,
        webRes,
      );
    }).listen(options?.port ?? 3000, options?.hostname ?? '127.0.0.1', () =>
      resolve(server),
    );
  });
