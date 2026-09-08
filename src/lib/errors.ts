/**
 * One place that turns anything thrown by Supabase, PostgREST, Postgres,
 * Storage or the network stack into something a shopkeeper can act on.
 *
 * Rules followed here:
 *   • say what happened in plain language, never leak SQL or stack traces;
 *   • say what to do next when there is something to do;
 *   • mark whether retrying is worth it, so the UI can offer a Retry button.
 */

export type ErrorKind =
  | 'NETWORK'
  | 'AUTH'
  | 'SESSION_EXPIRED'
  | 'PERMISSION'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'STORAGE'
  | 'SERVER'
  | 'CONFIG'
  | 'UNKNOWN';

export interface AppError {
  kind: ErrorKind;
  /** Short heading, e.g. for an alert title. */
  title: string;
  /** Full sentence shown to the user. */
  message: string;
  /** True when trying the same thing again might work. */
  retryable: boolean;
  /** True when the user must sign in again. */
  requiresSignIn: boolean;
  /** Kept for logs — never rendered. */
  original?: unknown;
}

interface RawError {
  message: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  name?: string;
}

function normalise(error: unknown): RawError {
  if (!error) return { message: '' };
  if (typeof error === 'string') return { message: error };

  const anyErr = error as Record<string, any>;
  return {
    message: String(anyErr.message ?? anyErr.error_description ?? anyErr.error ?? error),
    code: anyErr.code ?? anyErr.error_code ?? undefined,
    status: typeof anyErr.status === 'number' ? anyErr.status : anyErr.statusCode,
    details: anyErr.details,
    hint: anyErr.hint,
    name: anyErr.name,
  };
}

const make = (
  kind: ErrorKind,
  title: string,
  message: string,
  options: { retryable?: boolean; requiresSignIn?: boolean; original?: unknown } = {}
): AppError => ({
  kind,
  title,
  message,
  retryable: options.retryable ?? false,
  requiresSignIn: options.requiresSignIn ?? false,
  original: options.original,
});

/** Classifies any thrown value into something presentable. */
export function toAppError(error: unknown): AppError {
  const raw = normalise(error);
  const text = raw.message || '';
  const code = raw.code ? String(raw.code) : '';

  // --- connectivity -------------------------------------------------------
  if (
    /Network request failed|fetch failed|Failed to fetch|ERR_NETWORK|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(
      text
    ) ||
    raw.name === 'AbortError' ||
    /timeout/i.test(text)
  ) {
    return make(
      'NETWORK',
      'No connection',
      'Could not reach the server. Check your internet connection and try again — nothing was saved.',
      { retryable: true, original: error }
    );
  }

  // --- configuration ------------------------------------------------------
  if (/Invalid API key|Project not found|supabaseUrl is required/i.test(text)) {
    return make(
      'CONFIG',
      'App not configured',
      'The app cannot reach its database. Check the Supabase URL and key in the .env file, then restart the app.',
      { original: error }
    );
  }

  // --- authentication -----------------------------------------------------
  if (/Invalid login credentials/i.test(text)) {
    return make('AUTH', 'Sign-in failed', 'Wrong email or password. Please check and try again.', {
      original: error,
    });
  }
  if (/Email not confirmed/i.test(text)) {
    return make(
      'AUTH',
      'Email not confirmed',
      'Open the confirmation link we emailed you, then sign in. Check your spam folder if you cannot find it.',
      { original: error }
    );
  }
  if (/User already registered|already been registered/i.test(text)) {
    return make(
      'AUTH',
      'Account exists',
      'An account with this email already exists. Sign in instead, or use "Forgot password".',
      { original: error }
    );
  }
  if (/Password should be at least|Password is too weak/i.test(text)) {
    return make('VALIDATION', 'Weak password', 'Use a longer password — at least 8 characters.', {
      original: error,
    });
  }
  if (/Unable to validate email address|invalid format/i.test(text)) {
    return make('VALIDATION', 'Check the email', 'That email address does not look valid.', {
      original: error,
    });
  }
  if (/New password should be different/i.test(text)) {
    return make(
      'VALIDATION',
      'Choose a new password',
      'The new password must be different from your current one.',
      { original: error }
    );
  }
  if (
    code === 'PGRST301' ||
    /JWT expired|token is expired|refresh_token_not_found|Invalid Refresh Token|session_not_found/i.test(
      text
    )
  ) {
    return make(
      'SESSION_EXPIRED',
      'Signed out',
      'Your session has expired. Please sign in again to continue.',
      { requiresSignIn: true, original: error }
    );
  }
  if (code === '28000' || /Not authenticated/i.test(text)) {
    return make('AUTH', 'Not signed in', 'Please sign in again to continue.', {
      requiresSignIn: true,
      original: error,
    });
  }

  // --- rate limiting ------------------------------------------------------
  if (raw.status === 429 || /rate limit|too many requests|For security purposes/i.test(text)) {
    return make(
      'RATE_LIMIT',
      'Too many attempts',
      'Too many attempts in a short time. Please wait a minute and try again.',
      { retryable: true, original: error }
    );
  }

  // --- permissions --------------------------------------------------------
  if (
    code === '42501' ||
    raw.status === 403 ||
    /row-level security|violates row-level security|insufficient_privilege|permission denied|Not a member of this store/i.test(
      text
    )
  ) {
    return make(
      'PERMISSION',
      'Not allowed',
      'You do not have permission for this. Only the shop owner can make this change — ask them to do it, or to give you owner access.',
      { original: error }
    );
  }

  // --- missing rows -------------------------------------------------------
  if (code === 'P0002' || /No shop found for code/i.test(text)) {
    return make(
      'NOT_FOUND',
      'Shop not found',
      'That store code does not match any shop. Ask the owner to re-check the 6-character code on their Settings screen.',
      { original: error }
    );
  }
  if (code === 'PGRST116' || /Results contain 0 rows|JSON object requested/i.test(text)) {
    return make(
      'NOT_FOUND',
      'Not found',
      'That record no longer exists — someone may have deleted it. Pull down to refresh.',
      { retryable: true, original: error }
    );
  }

  // --- constraint violations ---------------------------------------------
  if (code === '23505' || /duplicate key value|already exists/i.test(text)) {
    const target = raw.details ?? text;
    if (/receipt_no/i.test(target)) {
      return make(
        'CONFLICT',
        'Receipt number clash',
        'That receipt number was just used on another device. Try saving again — a fresh number will be issued.',
        { retryable: true, original: error }
      );
    }
    if (/loan_no/i.test(target)) {
      return make(
        'CONFLICT',
        'Loan number clash',
        'That loan number was just used on another device. Try saving again — a fresh number will be issued.',
        { retryable: true, original: error }
      );
    }
    if (/customer_code/i.test(target)) {
      return make(
        'CONFLICT',
        'Customer code in use',
        'That customer code already exists in this shop. Try saving again.',
        { retryable: true, original: error }
      );
    }
    if (/store_code/i.test(target)) {
      return make('CONFLICT', 'Code clash', 'Please try again — a new store code will be issued.', {
        retryable: true,
        original: error,
      });
    }
    return make('CONFLICT', 'Already exists', 'This record already exists.', { original: error });
  }

  if (code === '23503' || /violates foreign key constraint/i.test(text)) {
    if (/customer/i.test(raw.details ?? text)) {
      return make(
        'CONFLICT',
        'Customer is in use',
        'This customer still has pledges recorded against them. Delete or settle those first.',
        { original: error }
      );
    }
    return make(
      'CONFLICT',
      'Still in use',
      'Another record depends on this one, so it cannot be removed yet.',
      { original: error }
    );
  }

  if (code === '23514' || /violates check constraint/i.test(text)) {
    const detail = raw.details ?? text;
    if (/rate_chk/i.test(detail)) {
      return make('VALIDATION', 'Check the rate', 'Interest rate must be between 0 and 50% a month.', {
        original: error,
      });
    }
    if (/amount/i.test(detail)) {
      return make('VALIDATION', 'Check the amount', 'The amount entered is not valid.', {
        original: error,
      });
    }
    return make('VALIDATION', 'Check the details', 'Some values entered are not valid.', {
      original: error,
    });
  }

  if (code === '23502' || /null value in column|violates not-null/i.test(text)) {
    return make('VALIDATION', 'Missing details', 'Please fill in all the required fields.', {
      original: error,
    });
  }

  if (code === '22P02' || /invalid input syntax/i.test(text)) {
    return make(
      'VALIDATION',
      'Check the details',
      'One of the values is in the wrong format. Please check the numbers and dates.',
      { original: error }
    );
  }

  if (code === '22023' || /Shop name is required/i.test(text)) {
    return make('VALIDATION', 'Shop name needed', 'Please enter your shop name.', {
      original: error,
    });
  }

  // --- storage ------------------------------------------------------------
  if (/Payload too large|exceeded the maximum allowed size/i.test(text) || raw.status === 413) {
    return make(
      'STORAGE',
      'Photo too large',
      'That photo is too big. Take the picture again — the app compresses camera photos automatically.',
      { original: error }
    );
  }
  if (/mime type .* is not supported|invalid_mime_type/i.test(text)) {
    return make('STORAGE', 'Unsupported photo', 'Only JPG, PNG and WebP images can be attached.', {
      original: error,
    });
  }
  if (/Bucket not found/i.test(text)) {
    return make(
      'CONFIG',
      'Storage not set up',
      'Photo storage is not configured on the server. Run supabase/schema.sql to create the girvi-photos bucket.',
      { original: error }
    );
  }
  if (/The resource already exists|Duplicate/i.test(text) && /storage/i.test(text)) {
    return make('STORAGE', 'Upload clash', 'That photo already exists. Try again.', {
      retryable: true,
      original: error,
    });
  }

  // --- server -------------------------------------------------------------
  if (raw.status && raw.status >= 500) {
    return make(
      'SERVER',
      'Server problem',
      'The server had a problem handling that. Please try again in a moment.',
      { retryable: true, original: error }
    );
  }

  // --- fallback -----------------------------------------------------------
  return make(
    'UNKNOWN',
    'Something went wrong',
    text
      ? `${text.charAt(0).toUpperCase()}${text.slice(1)}`
      : 'Something went wrong. Please try again.',
    { retryable: true, original: error }
  );
}

/** Shorthand when only the sentence is needed. */
export function describeError(error: unknown): string {
  return toAppError(error).message;
}

/**
 * Logs an error with context for debugging without ever showing raw text to
 * the user. In production this is where a crash reporter would be called.
 */
export function logError(context: string, error: unknown): void {
  const appError = toAppError(error);
  if (__DEV__) {
    console.warn(`[${context}] ${appError.kind}: ${appError.message}`, error);
  }
}
