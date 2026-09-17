import { http, HttpResponse } from 'msw'
import { ApiError, createApiClient } from './client'
import { API, server } from '../test/server'
import { problem } from '../test/fixtures'

describe('createApiClient', () => {
  const setup = () => {
    const onUnauthorized = vi.fn()
    const request = createApiClient({ baseUrl: API, getAccessToken: async () => 'tok', onUnauthorized })
    return { request, onUnauthorized }
  }

  it('sends the access token as Bearer and JSON bodies; skips empty query values', async () => {
    let seen: Request | undefined
    server.use(http.post(`${API}/collections`, async ({ request }) => ((seen = request.clone()), HttpResponse.json({ id: '1' }, { status: 201 }))))
    const { request } = setup()

    await request('POST', '/collections', { body: { name: 'x' }, query: { a: 'keep', b: undefined, c: '', d: null } })

    expect(seen?.headers.get('Authorization')).toBe('Bearer tok')
    expect(seen?.headers.get('Content-Type')).toBe('application/json')
    expect(new URL(seen!.url).search).toBe('?a=keep')
    expect(await seen!.json()).toEqual({ name: 'x' })
  })

  it('204 resolves to undefined', async () => {
    server.use(http.delete(`${API}/bookmarks/1`, () => new HttpResponse(null, { status: 204 })))
    await expect(setup().request('DELETE', '/bookmarks/1')).resolves.toBeUndefined()
  })

  it('Problem Details become a typed ApiError (status, code, field errors, bookmarkCount)', async () => {
    server.use(
      http.delete(`${API}/collections/1`, () => HttpResponse.json(problem(409, 'collection_not_empty', { bookmarkCount: 3 }), { status: 409 })),
      http.post(`${API}/bookmarks`, () => HttpResponse.json(problem(400, 'validation_failed', { errors: [{ field: 'url', message: 'bad' }] }), { status: 400 })),
    )
    const { request } = setup()

    const conflict = await request('DELETE', '/collections/1').catch((e: unknown) => e)
    expect(conflict).toBeInstanceOf(ApiError)
    expect(conflict).toMatchObject({ status: 409, code: 'collection_not_empty', bookmarkCount: 3 })

    const invalid = await request('POST', '/bookmarks', { body: {} }).catch((e: unknown) => e)
    expect(invalid).toMatchObject({ status: 400, errors: [{ field: 'url', message: 'bad' }] })
  })

  it('a non-Problem error body still becomes an ApiError without leaking the raw body', async () => {
    server.use(http.get(`${API}/me`, () => new HttpResponse('<html>proxy error</html>', { status: 502 })))
    const error = await setup().request('GET', '/me').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: 'http_502', message: 'Unexpected response from the API' })
  })

  it('401 calls onUnauthorized (redirect to login) and still rejects', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json(problem(401, 'unauthorized'), { status: 401 })))
    const { request, onUnauthorized } = setup()
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})
