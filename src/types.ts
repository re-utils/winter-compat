export type RequestHandler = (req: Request) => any;

export interface ServeOptions {
  port?: number;
  hostname?: string;
}

export declare const serve: (
  fetch: RequestHandler,
  options?: ServeOptions,
) => unknown;
export declare const requestIP: (req: Request) => string | undefined;
export declare const waitUntil: (promise: Promise<any>) => void;
