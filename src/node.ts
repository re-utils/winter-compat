import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeader,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import type { ServeOptions } from './types.ts';
import {
  bufferToUint8Array,
  joinHeaders,
  methodNotImplemented,
} from './utils.ts';

export const readBody = async (
  req: NodeRequest,
): Promise<Buffer<ArrayBuffer>> => {
  // Similar error to undici
  if (req.bodyUsed)
    throw new TypeError('Body is unusable: Body has already been read');

  if (req._bodyStream == null)
    return new Promise<Buffer<ArrayBuffer>>((res, rej) => {
      const chunks: any[] = [];
      const bodyStream = req._req;

      bodyStream
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .once('end', () => {
          res(Buffer.concat(chunks));
        })
        .once(
          'error',
          req._abort == null
            ? rej
            : (err) => {
                req._abort!();
                rej(err);
              },
        );
    });

  const reader = req._bodyStream.getReader();
  const buffers: Uint8Array[] = [];

  let val = await reader.read();
  while (!val.done) {
    buffers.push(val.value);
    val = await reader.read();
  }

  return Buffer.concat(buffers);
};

export class TRequestHeaders implements Headers {
  _req: IncomingMessage;

  getSetCookie: any;
  set: any;
  count: any;

  constructor(req: IncomingMessage) {
    this._req = req;
    this.set = this.getSetCookie = this.count = methodNotImplemented;
  }

  append(name: string, value: string): void {
    name = name.toLowerCase();

    const headers = this._req.headers;
    const cur = headers[name];

    if (typeof cur === 'string') headers[name] = [cur as string, value];
    else if (typeof cur === 'undefined') headers[name] = value;
    else cur.push(value);
  }

  delete(name: string): void {
    delete this._req.headers[name.toLowerCase()];
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

export class NodeRequest implements Request {
  readonly _req: IncomingMessage;

  readonly url: string;
  readonly method: string;

  constructor(req: IncomingMessage) {
    this._req = req;

    // Don't lazy load common stuff
    this.url =
      (req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') +
      (req.headers.host ?? req.headers[':authority']) +
      req.url!;
    this.method = this._req.method!;
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
    return new NodeRequest(this._req);
  }

  #headers?: TRequestHeaders;
  get headers(): Headers {
    return (this.#headers ??= new TRequestHeaders(this._req));
  }

  #bodyUsed?: boolean;
  get bodyUsed(): boolean {
    if (this.#bodyUsed != null) return this.#bodyUsed;
    if (this._bodyStream?.locked !== true) {
      const method = this.method;
      if (
        method === 'PATCH' ||
        method === 'POST' ||
        method === 'PUT' ||
        method === 'DELETE'
      ) {
        const contentLength = this._req.headers['content-length'];
        if (
          typeof contentLength === 'string' &&
          Number.isInteger(+contentLength)
        )
          return (this.#bodyUsed = false);

        const transferEncoding = this._req.headers['transfer-encoding'];
        if (typeof transferEncoding === 'string')
          for (
            let i = 0, parts = transferEncoding.split(',');
            i < parts.length;
            i++
          )
            if (parts[i].trim() === 'chunked') return (this.#bodyUsed = false);
      }
    }

    return (this.#bodyUsed = true);
  }

  _bodyStream?: ReadableStream<Uint8Array<ArrayBuffer>>;
  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null {
    if (this._bodyStream != null) return this._bodyStream;
    if (this.bodyUsed) return null;

    const bodyStream = this._req;
    if (this._abort != null)
      bodyStream.once('error', this._abort);

    return (this._bodyStream = Readable.toWeb(bodyStream) as any);
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return bufferToUint8Array(await readBody(this));
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await readBody(this)).buffer;
  }

  async blob(): Promise<Blob> {
    return new Blob([await readBody(this)], {
      type: this._req.headers['content-type'],
    });
  }

  async formData(): Promise<FormData> {
    return new Response(await readBody(this), {
      headers: this._req.headers as Record<string, string>,
    }).formData();
  }

  async json(): Promise<any> {
    return JSON.parse((await readBody(this)).toString());
  }

  async text(): Promise<string> {
    return (await readBody(this)).toString();
  }

  // @ts-ignore
  get cache(): RequestCache {
    methodNotImplemented();
  }

  // @ts-ignore
  get credentials(): RequestCredentials {
    methodNotImplemented();
  }

  // @ts-ignore
  get destination(): RequestDestination {
    methodNotImplemented();
  }

  // @ts-ignore
  get integrity(): string {
    methodNotImplemented();
  }

  // @ts-ignore
  get keepalive(): boolean {
    methodNotImplemented();
  }

  // @ts-ignore
  get mode(): RequestMode {
    methodNotImplemented();
  }

  // @ts-ignore
  get redirect(): RequestRedirect {
    methodNotImplemented();
  }

  // @ts-ignore
  get referrer(): string {
    methodNotImplemented();
  }

  // @ts-ignore
  get referrerPolicy(): ReferrerPolicy {
    methodNotImplemented();
  }
}

export const sendResponse = (nodeRes: ServerResponse, res: any): void => {
  if (res instanceof Response) {
    // Write headers
    const headers: OutgoingHttpHeader[] = [];
    for (const pair of res.headers.entries()) {
      if (pair[0] === 'set-cookie')
        for (
          let i = 0, cookies = res.headers.getSetCookie();
          i < cookies.length;
          i++
        )
          headers.push(['set-cookie', cookies[i]]);
      else headers.push(pair);
    }
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

export const sendResponseAsync = async (
  nodeRes: ServerResponse,
  res: Promise<any>,
): Promise<void> => {
  sendResponse(nodeRes, await res);
};

export const requestIP = (req: NodeRequest): string | undefined =>
  req._req.socket.remoteAddress;

export const serve = (options: ServeOptions, ready?: () => any): Server => {
  const { fetch, port, hostname } = options;

  return createServer((req, res) => {
    const webRes = fetch(new NodeRequest(req));
    (webRes instanceof Promise ? sendResponseAsync : sendResponse)(res, webRes);
  }).listen(port, hostname, ready);
};
