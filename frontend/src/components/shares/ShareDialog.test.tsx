import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { collection, me, page, problem } from '../../test/fixtures'
import { renderRoute } from '../../test/render'
import { API, server } from '../../test/server'

const COLLECTION = collection('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Security')
const share = (id: string, email: string) => ({ id, collectionId: COLLECTION.id, email, createdAt: '2026-09-17T10:00:00.000Z' })

/** Opens /collections/:id and the Share dialog. `onShare` answers POST /shares. */
async function openShareDialog(options: { shares?: ReturnType<typeof share>[]; onShare?: Parameters<typeof http.post>[1] } = {}) {
  const posted: unknown[] = []
  const deleted: string[] = []
  let rows = options.shares ?? []
  server.use(
    http.get(`${API}/me`, () => HttpResponse.json(me)),
    http.get(`${API}/collections`, () => HttpResponse.json(page([COLLECTION]))),
    http.get(`${API}/collections/:id`, () => HttpResponse.json(COLLECTION)),
    http.get(`${API}/collections/:id/bookmarks`, () => HttpResponse.json(page([]))),
    http.get(`${API}/collections/:id/shares`, () => HttpResponse.json(page(rows))),
    options.onShare
      ? http.post(`${API}/collections/:id/shares`, options.onShare)
      : http.post(`${API}/collections/:id/shares`, async ({ request }) => {
          const body = (await request.json()) as { email: string }
          posted.push(body)
          const created = share('s-new', body.email.toLowerCase())
          rows = [...rows, created]
          return HttpResponse.json(created, { status: 201 })
        }),
    http.delete(`${API}/collections/:id/shares/:shareId`, ({ params }) => {
      deleted.push(String(params.shareId))
      rows = rows.filter((r) => r.id !== params.shareId)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const view = renderRoute(`/collections/${COLLECTION.id}`)
  await view.user.click(await screen.findByRole('button', { name: 'Share' }))
  const dialog = await screen.findByRole('dialog', { name: /Share “Security”/ })
  return { ...view, dialog, posted, deleted }
}

describe('ShareDialog (ADR-019b/c/d)', () => {
  it('shares with an email, clears the field, and lists the recipient', async () => {
    const { user, dialog, posted } = await openShareDialog()

    await user.type(within(dialog).getByLabelText(/Email address/), 'USER-B@Example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(posted).toEqual([{ email: 'USER-B@Example.com' }]))
    expect(await within(dialog).findByText('user-b@example.com')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Email address/)).toHaveValue('')
  })

  it.each([
    ['recipient_not_found', 404, 'No account with a verified email matches this address.'],
    ['already_shared', 409, 'This collection is already shared with that person.'],
    ['ambiguous_recipient', 409, 'More than one account uses this email, so it was not shared.'],
  ])('%s → friendly message, nothing added to the list', async (code, status, message) => {
    const { user, dialog } = await openShareDialog({ onShare: () => HttpResponse.json(problem(status, code), { status }) })

    await user.type(within(dialog).getByLabelText(/Email address/), 'someone@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Share' }))

    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(within(dialog).getByText('Not shared with anyone yet.')).toBeInTheDocument()
  })

  it('self-share and invalid email are shown under the email field', async () => {
    const { user, dialog } = await openShareDialog({
      onShare: () =>
        HttpResponse.json(problem(400, 'validation_failed', { errors: [{ field: 'email', message: 'cannot share a collection with yourself' }] }), { status: 400 }),
    })

    await user.type(within(dialog).getByLabelText(/Email address/), 'candidate@test.com')
    await user.click(within(dialog).getByRole('button', { name: 'Share' }))

    expect(await within(dialog).findByText("You can't share a collection with yourself.")).toBeInTheDocument()
  })

  it('revoking asks for confirmation first, then removes access', async () => {
    const existing = share('s-1', 'user-b@example.com')
    const { user, deleted } = await openShareDialog({ shares: [existing] })

    await user.click(await screen.findByRole('button', { name: 'Stop sharing with user-b@example.com' }))
    const confirm = await screen.findByRole('dialog', { name: 'Stop sharing?' })
    expect(confirm).toHaveTextContent('They lose access immediately.')
    expect(deleted).toEqual([])

    await user.click(within(confirm).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(deleted).toEqual(['s-1']))
    await waitFor(() => expect(screen.queryByText('user-b@example.com')).toBeNull())
  })

  it('cancelling the revoke confirmation keeps access', async () => {
    const { user, deleted } = await openShareDialog({ shares: [share('s-1', 'user-b@example.com')] })

    await user.click(await screen.findByRole('button', { name: 'Stop sharing with user-b@example.com' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Stop sharing?' })).getByRole('button', { name: 'Cancel' }))

    expect(deleted).toEqual([])
    expect(screen.getByText('user-b@example.com')).toBeInTheDocument()
  })

  it('offers no way to grant edit rights (read-only sharing by design)', async () => {
    const { dialog } = await openShareDialog()
    expect(within(dialog).getByText(/can read this collection and its bookmarks. They cannot change anything/i)).toBeInTheDocument()
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    expect(within(dialog).queryByText(/can edit/i)).toBeNull()
  })
})
