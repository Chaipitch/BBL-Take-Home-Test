import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { collection, me, page, problem } from '../test/fixtures'
import { renderRoute } from '../test/render'
import { API, server } from '../test/server'

const READING = collection('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Reading')

function baseHandlers(collections = [READING]) {
  return [
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/collections`, () => HttpResponse.json(page(collections))),
  ]
}

describe('/collections', () => {
  describe('delete confirmation (ADR-005b, ADR-018i)', () => {
    it('empty collection: one confirmation, DELETE without confirm, list refreshes', async () => {
      const deletes: string[] = []
      let remaining = [READING]
      server.use(
        http.get(`${API}/me`, () => HttpResponse.json(me)),
        http.get(`${API}/collections`, () => HttpResponse.json(page(remaining))),
        http.delete(`${API}/collections/:id`, ({ request }) => {
          deletes.push(new URL(request.url).search)
          remaining = []
          return new HttpResponse(null, { status: 204 })
        }),
      )
      const { user } = renderRoute('/collections')

      await user.click(await screen.findByRole('button', { name: 'Delete Reading' }))
      const dialog = await screen.findByRole('dialog', { name: 'Delete collection?' })
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(deletes).toEqual([''])
      expect(await screen.findByText('No collections yet.')).toBeInTheDocument()
    })

    it('non-empty collection: 409 shows the exact count, second confirmation retries with confirm=true', async () => {
      const deletes: string[] = []
      server.use(
        ...baseHandlers(),
        http.delete(`${API}/collections/:id`, ({ request }) => {
          const search = new URL(request.url).search
          deletes.push(search)
          return search === '?confirm=true'
            ? new HttpResponse(null, { status: 204 })
            : HttpResponse.json(problem(409, 'collection_not_empty', { bookmarkCount: 3 }), { status: 409 })
        }),
      )
      const { user } = renderRoute('/collections')

      await user.click(await screen.findByRole('button', { name: 'Delete Reading' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))

      const second = await screen.findByRole('dialog', { name: 'Delete collection and its bookmarks?' })
      expect(second).toHaveTextContent('contains 3 bookmarks. They will be deleted too.')
      expect(deletes).toEqual([''])

      await user.click(within(second).getByRole('button', { name: 'Delete collection and 3 bookmarks' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(deletes).toEqual(['', '?confirm=true'])
    })

    it('cancelling after the 409 deletes nothing', async () => {
      const deletes: string[] = []
      server.use(
        ...baseHandlers(),
        http.delete(`${API}/collections/:id`, ({ request }) => {
          deletes.push(new URL(request.url).search)
          return HttpResponse.json(problem(409, 'collection_not_empty', { bookmarkCount: 1 }), { status: 409 })
        }),
      )
      const { user } = renderRoute('/collections')

      await user.click(await screen.findByRole('button', { name: 'Delete Reading' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog', { name: 'Delete collection and its bookmarks?' })).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(deletes).toEqual([''])
    })
  })

  describe('duplicate name warning (ADR-007, ADR-018j)', () => {
    function createFlow(existing: string[]) {
      const posted: unknown[] = []
      const nameQueries: string[] = []
      server.use(
        http.get(`${API}/me`, () => HttpResponse.json(me)),
        http.get(`${API}/collections`, ({ request }) => {
          const name = new URL(request.url).searchParams.get('name')
          if (name === null) return HttpResponse.json(page([]))
          nameQueries.push(name)
          return HttpResponse.json(page(existing.map((n, i) => collection(`bbbbbbbb-bbbb-4bbb-8bbb-00000000000${i}`, n))))
        }),
        http.post(`${API}/collections`, async ({ request }) => {
          const body = (await request.json()) as { name: string }
          posted.push(body)
          return HttpResponse.json(collection('cccccccc-cccc-4ccc-8ccc-cccccccccccc', body.name), { status: 201 })
        }),
        http.get(`${API}/collections/:id`, () => HttpResponse.json(collection('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Reading'))),
        http.get(`${API}/collections/:id/bookmarks`, () => HttpResponse.json(page([]))),
      )
      return { posted, nameQueries }
    }

    it('exact match ignoring case and spaces → warning first, then "Save anyway" creates it', async () => {
      const { posted, nameQueries } = createFlow(['reading'])
      const { user, router } = renderRoute('/collections')

      await user.click(await screen.findByRole('button', { name: 'New collection' }))
      await user.type(screen.getByLabelText(/Name/), '  Reading ')
      await user.click(screen.getByRole('button', { name: 'Create' }))

      expect(await screen.findByText(/A collection named “reading” already exists/)).toBeInTheDocument()
      expect(nameQueries).toEqual(['Reading'])
      expect(posted).toEqual([])

      await user.click(screen.getByRole('button', { name: 'Save anyway' }))
      await waitFor(() => expect(posted).toEqual([{ name: 'Reading' }]))
      await waitFor(() => expect(router.state.location.pathname).toBe('/collections/cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
    })

    it('a name that only contains the new name is not a duplicate → created without warning', async () => {
      const { posted } = createFlow(['Reading list'])
      const { user } = renderRoute('/collections')

      await user.click(await screen.findByRole('button', { name: 'New collection' }))
      await user.type(screen.getByLabelText(/Name/), 'Reading')
      await user.click(screen.getByRole('button', { name: 'Create' }))

      await waitFor(() => expect(posted).toEqual([{ name: 'Reading' }]))
      expect(screen.queryByText(/already exists/)).toBeNull()
    })
  })

  it('a collection that is not yours / does not exist shows a not-found message', async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections/:id`, () => HttpResponse.json(problem(404, 'not_found'), { status: 404 })),
      http.get(`${API}/collections/:id/bookmarks`, () => HttpResponse.json(problem(404, 'not_found'), { status: 404 })),
    )
    renderRoute('/collections/dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    expect(await screen.findByText('Not found. It may have been deleted, or it is not yours.')).toBeInTheDocument()
  })
})
