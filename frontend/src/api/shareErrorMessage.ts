import { ApiError } from './client'
import { errorMessage } from './errorMessage'

/** ADR-019c. Field-level problems are shown under the email input; these are dialog-level messages. */
export function shareErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'recipient_not_found') return 'No account with a verified email matches this address.'
    if (error.code === 'already_shared') return 'This collection is already shared with that person.'
    if (error.code === 'ambiguous_recipient') return 'More than one account uses this email, so it was not shared.'
  }
  return errorMessage(error)
}

/** The API returns self-sharing and invalid emails as a field error on `email`. */
export function shareFieldError(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const field = error.errors.find((e) => e.field === 'email')
    if (field) return field.message === 'cannot share a collection with yourself' ? "You can't share a collection with yourself." : field.message
  }
  return undefined
}

/** Expected outcomes (unknown recipient, duplicate, ambiguous) are warnings, not server errors. */
export function isExpectedShareProblem(error: unknown): boolean {
  return error instanceof ApiError && ['recipient_not_found', 'already_shared', 'ambiguous_recipient'].includes(error.code)
}
