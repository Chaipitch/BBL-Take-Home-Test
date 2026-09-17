import AddIcon from '@mui/icons-material/Add'
import { Button } from '@mui/material'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBookmarks, useDeleteBookmark } from '../api/bookmarks'
import { useCollections } from '../api/collections'
import type { Bookmark } from '../api/types'
import { BookmarkFilters } from '../components/bookmarks/BookmarkFilters'
import { BookmarkFormDialog } from '../components/bookmarks/BookmarkFormDialog'
import { BookmarkList } from '../components/bookmarks/BookmarkList'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { PageHeader } from '../components/common/PageHeader'

/** Brief §3.2: list bookmarks, view details (link), create, delete, filter by collection. */
export function BookmarksPage() {
  const [params, setParams] = useSearchParams()
  const collectionId = params.get('collectionId') ?? ''
  const q = params.get('q') ?? ''

  const bookmarks = useBookmarks({ collectionId: collectionId || undefined, q: q || undefined })
  const collections = useCollections(100)
  const deleteBookmark = useDeleteBookmark()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Bookmark | null>(null)

  const updateFilters = (next: { collectionId: string; q: string }) => {
    const search = new URLSearchParams()
    if (next.collectionId) search.set('collectionId', next.collectionId)
    if (next.q) search.set('q', next.q)
    setParams(search)
  }

  return (
    <>
      <PageHeader
        title="Bookmarks"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New bookmark
          </Button>
        }
      />
      <BookmarkFilters key={q} collectionId={collectionId} q={q} onChange={updateFilters} />
      {bookmarks.isLoading && <LoadingState />}
      {bookmarks.error && <ErrorAlert error={bookmarks.error} />}
      {bookmarks.data && (
        <BookmarkList
          bookmarks={bookmarks.data.pages.flatMap((p) => p.data)}
          collections={collections.data?.pages.flatMap((p) => p.data) ?? []}
          emptyText={collectionId || q ? 'No bookmarks match these filters.' : 'No bookmarks yet.'}
          onDelete={setDeleting}
        />
      )}
      <LoadMoreButton hasMore={bookmarks.hasNextPage} loading={bookmarks.isFetchingNextPage} onClick={() => void bookmarks.fetchNextPage()} />

      {creating && (
        <BookmarkFormDialog
          defaultCollectionId={collectionId && collectionId !== 'none' ? collectionId : undefined}
          onClose={() => setCreating(false)}
          onSaved={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete bookmark?"
        busy={deleteBookmark.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteBookmark.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        Delete “{deleting?.title}”? This cannot be undone.
        {deleteBookmark.error && <ErrorAlert error={deleteBookmark.error} />}
      </ConfirmDialog>
    </>
  )
}
