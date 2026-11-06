import { AsyncLocalStorage } from "node:async_hooks";

const jobAbort = new AsyncLocalStorage<AbortSignal>();

export function runWithJobAbort<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  return jobAbort.run(signal, run);
}

export function jobAbortSignal(): AbortSignal | undefined {
  return jobAbort.getStore();
}

export function jobStoppedError(): Error {
  const error = new Error("Stopped.");
  error.name = "JobStoppedError";
  return error;
}
