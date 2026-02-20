/**
 * fetchTimeout: wrapper around fetch() that enforces a per-request timeout.
 *
 * Node/Next supports AbortController; we use it to abort long-hanging internal calls
 * so the jobs worker doesn't get stuck on a single request.
 */

type FetchTimeoutOptions = RequestInit & {
  timeoutMs?: number;
};

export async function fetchTimeout(
  input: RequestInfo | URL,
  init: FetchTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = 30_000, signal: callerSignal, ...rest } = init;

  const ctrl = new AbortController();

  // If caller provided a signal, propagate abort.
  const onAbort = () => ctrl.abort();
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort();
    else callerSignal.addEventListener('abort', onAbort, { once: true });
  }

  const t = setTimeout(() => {
    ctrl.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
    if (callerSignal) callerSignal.removeEventListener('abort', onAbort);
  }
}
