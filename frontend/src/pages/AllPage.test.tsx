import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { bookmark, collection, me, page } from '../test/fixtures'
import { renderRoute } from '../test/render'
import { API, server } from '../test/server'

const WORK = collection('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Work')
const HOME = collection('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Home')

function handlers(options: { collections?: ReturnType<typeof collection>[]; nextCursor?: string | null } = {}) {
  const cols = options.collections ?? [WORK, HOME]
  return [
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/collections`, () => HttpResponse.json(page(cols, options.nextCursor ?? null))),
    http.get(`${API}/collections/${WORK.id}/bookmarks`, () => HttpResponse.json(page([bookmark('w1', 'Work one', { collectionId: WORK.id })]))),
    http.get(`${API}/collections/${HOME.id}/bookmarks`, () => HttpResponse.json(page([]))),
    http.get(`${API}/bookmarks`, ({ request }) => {
      const filter = new URL(request.url).searchParams.get('collectionId')
      return HttpResponse.json(filter === 'none' ? page([bookmark('u1', 'Loose one', { url: 'javascript:alert(1)' })]) : page([]))
    }),
  ]
}

describe('/all (bonus, ADR-020b)', () => {
  it('shows each collection with the bookmarks inside it, plus uncategorised', async () => {
    server.use(...handlers())
    renderRoute('/all')

    const work = await screen.findByRole('region', { name: 'Work' })
    expect(await within(work).findByRole('link', { name: 'Work one' })).toBeInTheDocument()
    expect(within(work).getByText('1 bookmark')).toBeInTheDocument()
    expect(within(work).getByRole('link', { name: 'Work' })).toHaveAttribute('href', `/collections/${WORK.id}`)

    const home = await screen.findByRole('region', { name: 'Home' })
    expect(await within(home).findByText('This collection is empty.')).toBeInTheDocument()

    const loose = await screen.findByRole('region', { name: 'Uncategorised' })
    expect(await within(loose).findByRole('link', { name: 'Loose one' })).toBeInTheDocument()
    // Unsafe stored URL stays text here too.
    expect(within(loose).queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
  })

  it('is a read-only overview: no delete buttons', async () => {
    server.use(...handlers())
    renderRoute('/all')
    expect(await screen.findByRole('link', { name: 'Work one' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
  })

  it('says so when there are more collections than the first page', async () => {
    server.use(...handlers({ nextCursor: 'more' }))
    renderRoute('/all')
    expect(await screen.findByText(/Showing the first 2 collections/)).toBeInTheDocument()
  })

  it('is reachable from the app bar', async () => {
    server.use(...handlers({ collections: [] }))
    renderRoute('/all')
    expect(await screen.findByRole('link', { name: 'All' })).toHaveAttribute('href', '/all')
  })
})
