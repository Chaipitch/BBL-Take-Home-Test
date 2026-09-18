import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { me, page, problem } from '../test/fixtures'
import { renderRoute } from '../test/render'
import { API, server } from '../test/server'

const SHARED = {
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  name: 'Team reading list',
  ownerEmail: 'user-b@example.com',
  sharedAt: '2026-09-17T10:00:00.000Z',
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
}
const sharedBookmark = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  url: `https://example.com/${id}`,
  notes: null,
  collectionId: SHARED.id,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
  ...extra,
})

const base = () => [http.get(`${API}/me`, () => HttpResponse.json(me)), http.get(`${API}/collections`, () => HttpResponse.json(page([])))]

describe('/shared (ADR-019a/e)', () => {
  it('lists collections shared with me, with owner email and no write actions', async () => {
    server.use(...base(), http.get(`${API}/shared/collections`, () => HttpResponse.json(page([SHARED]))))
    renderRoute('/shared')

    const item = await screen.findByRole('link', { name: /Team reading list/ })
    expect(item).toHaveTextContent('Shared by user-b@example.com')
    expect(screen.queryByRole('button', { name: /Delete|Rename|New collection/ })).toBeNull()
  })

  it('empty state when nothing is shared with me', async () => {
    server.use(...base(), http.get(`${API}/shared/collections`, () => HttpResponse.json(page([]))))
    renderRoute('/shared')
    expect(await screen.findByText('Nobody has shared a collection with you yet.')).toBeInTheDocument()
  })

  it('opens a shared collection read-only: notes inline, no edit/delete/add, no links to owner pages', async () => {
    server.use(
      ...base(),
      http.get(`${API}/shared/collections/:id`, () => HttpResponse.json(SHARED)),
      http.get(`${API}/shared/collections/:id/bookmarks`, () =>
        HttpResponse.json(page([sharedBookmark('sb1', 'Microservices', { notes: 'Shared with candidate' }), sharedBookmark('sb2', 'Legacy', { url: 'javascript:alert(1)' })])),
      ),
    )
    renderRoute(`/shared/${SHARED.id}`)

    expect(await screen.findByRole('heading', { name: 'Team reading list' })).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getByText(/Shared by user-b@example.com/)).toBeInTheDocument()
    expect(screen.getByText('Shared with candidate')).toBeInTheDocument()

    for (const name of [/^Edit$/, /^Delete$/, /^Rename$/, /^Share$/, /Add bookmark/, /New bookmark/]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    // Titles must not link to owner-only routes (they would 404 for a recipient).
    expect(screen.queryByRole('link', { name: 'Microservices' })).toBeNull()
    // (the app bar's "Bookmarks" nav link is fine; no link may point at an owner-only detail page)
    const detailLinks = screen.getAllByRole('link').filter((link) => /^\/(bookmarks|collections)\/.+/.test(link.getAttribute('href') ?? ''))
    expect(detailLinks).toEqual([])
    // Unsafe stored URL stays text.
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
  })

  it('searching filters the shared bookmarks through the API and the URL', async () => {
    const queries: string[] = []
    server.use(
      ...base(),
      http.get(`${API}/shared/collections/:id`, () => HttpResponse.json(SHARED)),
      http.get(`${API}/shared/collections/:id/bookmarks`, ({ request }) => {
        queries.push(new URL(request.url).search)
        return HttpResponse.json(page([sharedBookmark('sb1', 'Microservices')]))
      }),
    )
    const { user, router } = renderRoute(`/shared/${SHARED.id}`)

    await user.type(await screen.findByLabelText('Search titles'), 'micro{Enter}')

    await waitFor(() => expect(router.state.location.search).toBe('?q=micro'))
    await waitFor(() => expect(queries).toContain('?q=micro'))
  })

  it('a collection that is not shared with me (or was revoked) shows a not-found message', async () => {
    server.use(
      ...base(),
      http.get(`${API}/shared/collections/:id`, () => HttpResponse.json(problem(404, 'not_found'), { status: 404 })),
      http.get(`${API}/shared/collections/:id/bookmarks`, () => HttpResponse.json(problem(404, 'not_found'), { status: 404 })),
    )
    renderRoute(`/shared/${SHARED.id}`)
    expect(await screen.findByText(/no longer shared with you/)).toBeInTheDocument()
  })

  it('the app bar links to Shared with me', async () => {
    server.use(...base(), http.get(`${API}/shared/collections`, () => HttpResponse.json(page([]))))
    renderRoute('/shared')
    const nav = await screen.findByRole('link', { name: 'Shared with me' })
    expect(nav).toHaveAttribute('href', '/shared')
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Collections' })).toBeInTheDocument()
  })
})
