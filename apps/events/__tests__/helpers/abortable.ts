/** Attach abortSignal() as an identity so PostgREST-style chains work in mocks. */
export function abortable<T extends object>(
  obj: T
): T & { abortSignal: () => T & { abortSignal: () => unknown } } {
  const wrapped = { ...obj } as T & {
    abortSignal: () => T & { abortSignal: () => unknown };
  };
  wrapped.abortSignal = () => wrapped;
  return wrapped;
}

export function abortablePromise<T>(
  promise: Promise<T>
): Promise<T> & { abortSignal: () => Promise<T> } {
  const p = promise as Promise<T> & { abortSignal: () => Promise<T> };
  p.abortSignal = () => p;
  return p;
}
