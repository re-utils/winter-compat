export interface ServeOptions {
  fetch: (req: Request) => any;
  port?: number;
  hostname?: string;
}

export declare const serve: (options: ServeOptions, ready?: () => void) => any;
export declare const requestIP: (req: Request) => string | undefined;
