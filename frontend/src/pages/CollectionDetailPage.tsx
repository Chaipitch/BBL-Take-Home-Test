import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Button, Link, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { useDeleteBookmark } from '../api/bookmarks'
import { useCollection, useCollectionBookmarks } from '../api/collections'
import type { Bookmark } from '../api/types'
import { BookmarkFormDialog } from '../components/bookmarks/BookmarkFormDialog'
import { BookmarkList } from '../components/bookmarks/BookmarkList'
import { CollectionFormDialog } from '../components/collections/CollectionFormDialog'
import { DeleteCollectionDialog } from '../components/collections/DeleteCollectionDialog'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { PageHeader } from '../components/common/PageHeader'

/** Brief §3.2 "view one": the collection, its bookmarks, rename, add bookmark, delete. */
export function CollectionDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const collection = useCollection(id)
  const bookmarks = useCollectionBookmarks(id)
  const deleteBookmark = useDeleteBookmark()
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deletingCollection, setDeletingCollection] = useState(false)
  const [deletingBookmark, setDeletingBookmark] = useState<Bookmark | null>(null)

  const back = (
    <Link component={RouterLink} to="/collections" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
      <ArrowBackIcon fontSize="small" /> All collections
    </Link>
  )

  if (collection.isLoading) return <LoadingState />
  if (collection.error || !collection.data) return <>{back}<ErrorAlert error={collection.error} /></>

  return (
    <>
      {back}
      <PageHeader
        title={collection.data.name}
        actions={
          <>
            <Button onClick={() => setRenaming(true)}>Rename</Button>
            <Button color="error" onClick={() => setDeletingCollection(true)}>
              Delete
            </Button>
          </>
        }
      />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6" component="h2">
          Bookmarks
        </Typography>
        <Button startIcon={<AddIcon />} onClick={() => setAdding(true)}>
          Add bookmark
        </Button>
      </Stack>
      {bookmarks.isLoading && <LoadingState />}
      {bookmarks.error && <ErrorAlert error={bookmarks.error} />}
      {bookmarks.data && (
        <BookmarkList bookmarks={bookmarks.data.pages.flatMap((p) => p.data)} emptyText="This collection is empty." onDelete={setDeletingBookmark} />
      )}
      <LoadMoreButton hasMore={bookmarks.hasNextPage} loading={bookmarks.isFetchingNextPage} onClick={() => void bookmarks.fetchNextPage()} />

      {renaming && <CollectionFormDialog collection={collection.data} onClose={() => setRenaming(false)} onSaved={() => setRenaming(false)} />}
      {adding && <BookmarkFormDialog defaultCollectionId={id} onClose={() => setAdding(false)} onSaved={() => setAdding(false)} />}
      {deletingCollection && (
        <DeleteCollectionDialog
          collection={collection.data}
          onClose={() => setDeletingCollection(false)}
          onDeleted={() => void navigate('/collections', { replace: true })}
        />
      )}
      <ConfirmDialog
        open={deletingBookmark !== null}
        title="Delete bookmark?"
        busy={deleteBookmark.isPending}
        onCancel={() => setDeletingBookmark(null)}
        onConfirm={() => deletingBookmark && deleteBookmark.mutate(deletingBookmark.id, { onSuccess: () => setDeletingBookmark(null) })}
      >
        Delete “{deletingBookmark?.title}”? This cannot be undone.
        {deleteBookmark.error && <ErrorAlert error={deleteBookmark.error} />}
      </ConfirmDialog>
    </>
  )
}
