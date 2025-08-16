export const methodNotImplemented = (): never => {
  throw new Error('Method not implemented');
};

export const joinHeaders = (val: string | string[]): string =>
  typeof val === 'string' ? val : val.join(', ');

export const noop = (): void => {};

const methodNotImplementedGetter = {
  get: methodNotImplemented,
};

export const notImplementedGetters = (
  targetClass: new (...args: any[]) => any,
  ...names: string[]
): void => {
  for (let i = 0; i < names.length; i++)
    Object.defineProperty(
      targetClass.prototype,
      names[i],
      methodNotImplementedGetter,
    );
};

export const useRequestBody = (req: Request): void => {
  // Similar error to undici
  if (req.bodyUsed)
    throw new TypeError('Body is unusable: Body has already been read');
  // @ts-ignore
  req.bodyUsed = true;
};
