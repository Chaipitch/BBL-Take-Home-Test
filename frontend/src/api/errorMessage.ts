import { ApiError } from './client'

/** Human text for API errors; never shows raw exception internals. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Not found. It may have been deleted, or it is not yours.'
    if (error.status === 503) return 'The service is temporarily unavailable. Please try again.'
    if (error.status === 401) return 'Your session has expired. Redirecting to sign in…'
    return error.message
  }
  return 'Something went wrong. Please try again.'
}
