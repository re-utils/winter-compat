export const methodNotImplemented = (): never => {
  throw new Error('Method not implemented');
};

export const joinHeaders = (val: string | string[]): string =>
  typeof val === 'string' ? val : val.join(', ');

export const bufferToUint8Array = (buf: Buffer<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
