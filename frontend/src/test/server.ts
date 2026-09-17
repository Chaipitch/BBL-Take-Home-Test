import { setupServer } from 'msw/node'

export const API = 'http://api.test'

/** Mocked API. Tests register handlers per case with `server.use(...)`; unhandled requests fail the test. */
export const server = setupServer()
