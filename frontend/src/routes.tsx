import { Navigate, type RouteObject } from 'react-router'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { BookmarkDetailPage } from './pages/BookmarkDetailPage'
import { AllPage } from './pages/AllPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { CallbackPage } from './pages/CallbackPage'
import { CollectionDetailPage } from './pages/CollectionDetailPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SharedCollectionPage } from './pages/SharedCollectionPage'
import { SharedCollectionsPage } from './pages/SharedCollectionsPage'

/** ADR-018g. Everything except /callback requires login. Exported for tests (createMemoryRouter). */
export const routes: RouteObject[] = [
  { path: '/callback', element: <CallbackPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/collections" replace /> },
      { path: '/collections', element: <CollectionsPage /> },
      { path: '/collections/:id', element: <CollectionDetailPage /> },
      { path: '/bookmarks', element: <BookmarksPage /> },
      { path: '/bookmarks/:id', element: <BookmarkDetailPage /> },
      { path: '/all', element: <AllPage /> },
      { path: '/shared', element: <SharedCollectionsPage /> },
      { path: '/shared/:id', element: <SharedCollectionPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
