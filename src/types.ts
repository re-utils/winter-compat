export interface ServeOptions {
  fetch: (req: Request) => any;
  port?: number;
  hostname?: string;
}

export declare const serve: (options: ServeOptions) => any;
export declare const requestIP: (req: Request) => string | undefined | null;
export declare const waitUntil: (promise: Promise<any>) => void;
