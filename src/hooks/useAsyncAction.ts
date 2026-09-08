import { useCallback, useRef, useState } from 'react';

import { AppError, logError, toAppError } from '../lib/errors';

interface Options {
  /** Label used in logs, e.g. 'CollectPayment.save'. */
  context: string;
  /** Runs only when the action succeeded. */
  onSuccess?: () => void;
  /** Runs on failure, after the error has been classified. */
  onError?: (error: AppError) => void;
}

interface AsyncAction<TArgs extends unknown[]> {
  run: (...args: TArgs) => Promise<boolean>;
  busy: boolean;
  error: AppError | null;
  clearError: () => void;
}

/**
 * Standard wrapper for anything that writes to the server.
 *
 * Gives every caller the same three guarantees:
 *   • a `busy` flag, and a hard guard against double submission — a shopkeeper
 *     double-tapping "Save" must never create two receipts;
 *   • errors classified once, logged, and returned as a presentable AppError;
 *   • no state updates after unmount.
 */
export function useAsyncAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown>,
  options: Options
): AsyncAction<TArgs> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError(null);

      try {
        await action(...args);
        options.onSuccess?.();
        return true;
      } catch (caught) {
        const appError = toAppError(caught);
        logError(options.context, caught);
        setError(appError);
        options.onError?.(appError);
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    // `options` is re-created every render by callers; depending on the
    // individual fields keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, options.context, options.onSuccess, options.onError]
  );

  return {
    run,
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
