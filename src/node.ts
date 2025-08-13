import type { IncomingMessage, ServerResponse } from 'node:http';
import { bufferToUint8Array, joinHeaders, methodNotImplemented } from './utils.ts';

const readBody = async (req: TRequest): Promise<Buffer<ArrayBuffer>> => {
  if (req._bodyStream != null) {
    const reader = req._bodyStream.getReader();
    const buffers: Uint8Array[] = [];

    let val = await reader.read();
    while (!val.done) {
      buffers.push(val.value);
      val = await reader.read();
    }

    return Buffer.concat(buffers);
  }

  // Similar error to undici
  if (req.bodyUsed)
    throw new TypeError('Body is unusable: Body has already been read');

  return new Promise<Buffer<ArrayBuffer>>((res, rej) => {
    const chunks: any[] = [];

    req._req
      .on('data', (chunk) => {
        chunks.push(chunk);
      })
      .once('error', (error) => {
        req._abortController?.abort();
        rej(error);
      })
      .once('close', () => {
        req._abortController?.abort();
      })
      .once('end', () => {
        res(Buffer.concat(chunks));
      });
  });
}

class TRequestHeaders implements Headers {
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
    const val = this._req.headers[name.toLowerCase()];
    return val == null ? null : joinHeaders(val);
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
      if (headers[key] != null) result[key] = joinHeaders(headers[key]!);
    return result;
  }

  forEach(
    cb: (value: string, key: string, parent: Headers) => void,
    thisArg?: any,
  ): void {
    const headers = this._req.headers;
    for (const key in headers)
      if (headers[key] != null)
        cb.call(thisArg, joinHeaders(headers[key]!), key, this as any);
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
    const notHttp2 = this._req.httpVersion !== '2.0';

    for (const key in headers) {
      if (notHttp2 && headers[key] == null)
        yield [key, joinHeaders(headers[key]!)];
    }
  }

  [Symbol.iterator](): HeadersIterator<[string, string]> {
    return this.entries();
  }
}

export const requestIP = (req: TRequest): string | undefined =>
  req._req.socket.remoteAddress;

export class TRequest implements Request {
  readonly _req: IncomingMessage;
  readonly _res: ServerResponse;

  readonly url: string;
  readonly method: string;

  constructor(req: IncomingMessage, res: ServerResponse) {
    this._req = req;
    this._res = res;

    // Don't lazy load common stuff
    this.url =
      (req.headers['x-forwarded-proto'] === 'https' ? 'https://' : 'http://') +
      (req.headers.host ?? req.headers[':authority']) +
      req.url!;
    this.method = this._req.method!;
  }

  _abortController?: AbortController;
  get signal(): AbortSignal {
    if (this._abortController != null) return this._abortController.signal;

    const controller = new AbortController();
    this._req.once('close', () => {
      controller.abort();
    });

    return (this._abortController = controller).signal;
  }

  clone(): Request {
    return new TRequest(this._req, this._res);
  }

  #headers?: TRequestHeaders;
  get headers(): Headers {
    return (this.#headers ??= new TRequestHeaders(this._req));
  }

  #bodyUsed?: boolean;
  get bodyUsed(): boolean {
    if (this.#bodyUsed != null) return this.#bodyUsed;
    const method = this.method;

    if (
      method === 'PATCH' ||
      method === 'POST' ||
      method === 'PUT' ||
      method === 'DELETE'
    ) {
      const contentLength = this._req.headers['content-length'];
      if (typeof contentLength === 'string' && Number.isInteger(+contentLength))
        return this.#bodyUsed = false;

      const transferEncoding = this._req.headers['transfer-encoding'];
      if (typeof transferEncoding === 'string')
        for (
          let i = 0, parts = transferEncoding.split(',');
          i < parts.length;
          i++
        )
          if (parts[i].trim() === 'chunked') return this.#bodyUsed = false;
    }

    return this.#bodyUsed = true;
  }

  _bodyStream?: ReadableStream<Uint8Array<ArrayBuffer>>;
  get body(): ReadableStream<Uint8Array<ArrayBuffer>> | null {
    if (this._bodyStream != null) return this._bodyStream;

    if (this.bodyUsed) return null;
    this.#bodyUsed = true;

    return (this._bodyStream = new ReadableStream({
      start: (controller) => {
        this._req
          .on('data', (chunk) => {
            controller.enqueue(chunk);
          })
          .once('error', (error) => {
            controller.error(error);
            this._abortController?.abort();
          })
          .once('close', () => {
            this._abortController?.abort();
          })
          .once('end', () => {
            controller.close();
          });
      },
    }));
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return bufferToUint8Array(await readBody(this));
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await readBody(this)).buffer;
  }

  async blob(): Promise<Blob> {
    return new Blob([await readBody(this)], {
      type: this._req.headers['content-type']
    });
  }

  async formData(): Promise<FormData> {
    return new Response(await readBody(this), {
      headers: this.headers
    }).formData();
  }

  async json(): Promise<any> {
    return (await readBody(this)).toJSON();
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
