import type { FieldError, ProblemDetails } from './types'

/** Typed API error built from a Problem Details body (ADR-018f). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: FieldError[]
  readonly bookmarkCount?: number

  constructor(problem: ProblemDetails) {
    super(problem.detail)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
    this.errors = problem.errors ?? []
    this.bookmarkCount = problem.bookmarkCount
  }
}

export type QueryValue = string | number | undefined | null

export interface RequestOptions {
  body?: unknown
  query?: Record<string, QueryValue>
}

export interface ApiClientDeps {
  baseUrl: string
  /** Returns a current access token (ADR-008). */
  getAccessToken: () => Promise<string>
  /** Called when the API answers 401 (token expired/rejected). */
  onUnauthorized: () => void
  fetchImpl?: typeof fetch
}

export type ApiRequest = <T>(method: string, path: string, options?: RequestOptions) => Promise<T>

function isProblem(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && typeof (value as ProblemDetails).status === 'number' && typeof (value as ProblemDetails).code === 'string'
}

export function createApiClient({ baseUrl, getAccessToken, onUnauthorized, fetchImpl = fetch }: ApiClientDeps): ApiRequest {
  return async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(baseUrl + path)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }

    const token = await getAccessToken()
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetchImpl(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    if (response.status === 204) return undefined as T
    const body: unknown = await response.json().catch(() => undefined)

    if (!response.ok) {
      if (response.status === 401) onUnauthorized()
      throw new ApiError(
        isProblem(body)
          ? body
          : { type: 'about:blank', title: response.statusText, status: response.status, detail: 'Unexpected response from the API', code: `http_${response.status}` },
      )
    }
    return body as T
  }
}
