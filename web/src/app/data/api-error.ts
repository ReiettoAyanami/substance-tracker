/**
 * A failed API call, as the error interceptor hands it to the caller. Built from the Problem
 * Details body (RFC 9457) when there is one; a network failure has no status.
 */
export interface ApiError {
  status: number | null;
  /** The problem's code, the end of its `type` (e.g. `not-found`, `banned-user`); null without one. */
  code: string | null;
  title: string;
  detail: string;
  fieldErrors: FieldError[];
}

/** One validation error, for the form field named by `field` (empty for the whole body). */
export interface FieldError {
  field: string;
  message: string;
}
