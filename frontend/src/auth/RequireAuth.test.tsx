import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { auth } from '../test/auth'
import { me, page, problem } from '../test/fixtures'
import { renderRoute } from '../test/render'
import { API, server } from '../test/server'

describe('authentication in the UI', () => {
  it('not signed in → redirects to Auth0 remembering the page and filters; calls no API', async () => {
    auth.isAuthenticated = false
    const apiCalls: string[] = []
    server.use(http.all(`${API}/*`, ({ request }) => (apiCalls.push(request.url), HttpResponse.json({}))))

    renderRoute('/bookmarks?q=postgres')

    await waitFor(() => expect(auth.loginWithRedirect).toHaveBeenCalledWith({ appState: { returnTo: '/bookmarks?q=postgres' } }))
    expect(screen.getByText('Signing in…')).toBeInTheDocument()
    expect(apiCalls).toEqual([])
  })

  it('the API answering 401 (expired/rejected token) sends the user to login', async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(problem(401, 'unauthorized'), { status: 401 })),
      http.get(`${API}/collections`, () => HttpResponse.json(problem(401, 'unauthorized'), { status: 401 })),
    )
    renderRoute('/collections')
    await waitFor(() => expect(auth.loginWithRedirect).toHaveBeenCalled())
  })

  it('requests use the access token for the API audience', async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections`, () => HttpResponse.json(page([]))),
    )
    renderRoute('/collections')
    await screen.findByText('No collections yet.')
    expect(auth.getAccessTokenSilently).toHaveBeenCalledWith({ authorizationParams: { audience: 'https://api.test' } })
  })

  it('logout returns to the app origin (brief logout URL)', async () => {
    server.use(
      http.get(`${API}/me`, () => HttpResponse.json(me)),
      http.get(`${API}/collections`, () => HttpResponse.json(page([]))),
    )
    const { user } = renderRoute('/collections')
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    expect(auth.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: window.location.origin } })
  })
})
