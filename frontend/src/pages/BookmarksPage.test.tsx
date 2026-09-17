import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { bookmark, collection, me, page, problem } from '../test/fixtures'
import { renderRoute } from '../test/render'
import { API, server } from '../test/server'

const WORK = collection('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Work')

describe('/bookmarks', () => {
  function handlers(bookmarkQueries: string[]) {
    return [
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections`, () => HttpResponse.json(page([WORK]))),
      http.get(`${API}/bookmarks`, ({ request }) => {
        bookmarkQueries.push(new URL(request.url).search)
        return HttpResponse.json(page([bookmark('b1', 'Postgres tips', { collectionId: WORK.id })]))
      }),
    ]
  }

  it('filters come from the URL on load (ADR-018h)', async () => {
    const queries: string[] = []
    server.use(...handlers(queries))
    renderRoute('/bookmarks?collectionId=none&q=postgres')

    expect(await screen.findByText('Postgres tips')).toBeInTheDocument()
    expect(queries).toEqual(['?collectionId=none&q=postgres'])
    expect(screen.getByLabelText('Search titles')).toHaveValue('postgres')
  })

  it('choosing a collection updates the URL and refetches with collectionId', async () => {
    const queries: string[] = []
    server.use(...handlers(queries))
    const { user, router } = renderRoute('/bookmarks')

    await user.click(await screen.findByRole('combobox', { name: 'Collection' }))
    await user.click(await screen.findByRole('option', { name: 'Work' }))

    await waitFor(() => expect(router.state.location.search).toBe(`?collectionId=${WORK.id}`))
    await waitFor(() => expect(queries).toContain(`?collectionId=${WORK.id}`))

    await user.click(screen.getByRole('combobox', { name: 'Collection' }))
    await user.click(await screen.findByRole('option', { name: 'Uncategorised' }))
    await waitFor(() => expect(router.state.location.search).toBe('?collectionId=none'))
  })

  it('search submits q to the URL', async () => {
    const queries: string[] = []
    server.use(...handlers(queries))
    const { user, router } = renderRoute('/bookmarks')

    await user.type(await screen.findByLabelText('Search titles'), 'nest{Enter}')
    await waitFor(() => expect(router.state.location.search).toBe('?q=nest'))
    await waitFor(() => expect(queries).toContain('?q=nest'))
  })

  it('shows API field errors on the form (e.g. unsafe URL rejected by the API)', async () => {
    server.use(
      ...handlers([]),
      http.post(`${API}/bookmarks`, () =>
        HttpResponse.json(problem(400, 'validation_failed', { errors: [{ field: 'url', message: 'Invalid URL' }] }), { status: 400 }),
      ),
    )
    const { user } = renderRoute('/bookmarks')

    await user.click(await screen.findByRole('button', { name: 'New bookmark' }))
    const dialog = await screen.findByRole('dialog', { name: 'New bookmark' })
    await user.type(within(dialog).getByLabelText(/URL/), 'javascript:alert(1)')
    await user.type(within(dialog).getByLabelText(/Title/), 'evil')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await within(dialog).findByText('Invalid URL')).toBeInTheDocument()
  })

  // Regression: the select used to coerce an id outside the loaded options to "No collection". Saving
  // still sent the right id (form state is separate), but the form showed the wrong collection.
  it('editing a bookmark whose collection is not in the loaded options shows it as selected and keeps it', async () => {
    const otherCollectionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    let putBody: unknown
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections`, () => HttpResponse.json(page([WORK]))),
      http.get(`${API}/collections/:id`, () => HttpResponse.json(collection(otherCollectionId, 'Far away'))),
      http.get(`${API}/bookmarks/:id`, () => HttpResponse.json(bookmark('b1', 'Deep', { collectionId: otherCollectionId }))),
      http.put(`${API}/bookmarks/:id`, async ({ request }) => {
        putBody = await request.json()
        return HttpResponse.json(bookmark('b1', 'Deep renamed', { collectionId: otherCollectionId }))
      }),
    )
    const { user } = renderRoute('/bookmarks/b1')

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit bookmark' })
    const select = within(dialog).getByRole('combobox', { name: 'Collection' })
    await waitFor(() => expect(select).toHaveTextContent('Current collection'))
    expect(select).not.toHaveTextContent('No collection')
    const title = within(dialog).getByLabelText(/Title/)
    await user.clear(title)
    await user.type(title, 'Deep renamed')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(putBody).toMatchObject({ title: 'Deep renamed', collectionId: otherCollectionId }))
  })

  it('an unsafe stored URL is shown as text, not a link', async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections`, () => HttpResponse.json(page([]))),
      http.get(`${API}/bookmarks`, () => HttpResponse.json(page([bookmark('b1', 'Legacy', { url: 'javascript:alert(1)' })]))),
    )
    renderRoute('/bookmarks')
    expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
  })
})
