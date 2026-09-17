import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Button, Link, Paper, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { useBookmark, useDeleteBookmark } from '../api/bookmarks'
import { useCollection } from '../api/collections'
import { BookmarkFormDialog } from '../components/bookmarks/BookmarkFormDialog'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { PageHeader } from '../components/common/PageHeader'
import { SafeLink } from '../components/common/SafeLink'

function CollectionName({ id }: { id: string }) {
  const collection = useCollection(id)
  if (!collection.data) return <>…</>
  return (
    <Link component={RouterLink} to={`/collections/${id}`}>
      {collection.data.name}
    </Link>
  )
}

/** Brief §3.2 "view details": all fields, edit, delete. */
export function BookmarkDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const bookmark = useBookmark(id)
  const remove = useDeleteBookmark()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const back = (
    <Link component={RouterLink} to="/bookmarks" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
      <ArrowBackIcon fontSize="small" /> All bookmarks
    </Link>
  )

  if (bookmark.isLoading) return <LoadingState />
  if (bookmark.error || !bookmark.data) return <>{back}<ErrorAlert error={bookmark.error} /></>
  const b = bookmark.data

  return (
    <>
      {back}
      <PageHeader
        title={b.title}
        actions={
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            <Button color="error" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          </>
        }
      />
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack sx={{ gap: 2 }}>
          <div>
            <Typography variant="overline" component="div">URL</Typography>
            <SafeLink url={b.url} />
          </div>
          <div>
            <Typography variant="overline" component="div">Collection</Typography>
            {b.collectionId ? <CollectionName id={b.collectionId} /> : <Typography>Uncategorised</Typography>}
          </div>
          <div>
            <Typography variant="overline" component="div">Notes</Typography>
            <Typography sx={{ whiteSpace: 'pre-wrap' }} color={b.notes ? 'text.primary' : 'text.secondary'}>
              {b.notes ?? 'No notes'}
            </Typography>
          </div>
          <Typography variant="body2" color="text.secondary">
            Created {new Date(b.createdAt).toLocaleString()} · Updated {new Date(b.updatedAt).toLocaleString()}
          </Typography>
        </Stack>
      </Paper>

      {editing && <BookmarkFormDialog bookmark={b} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        title="Delete bookmark?"
        busy={remove.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => remove.mutate(b.id, { onSuccess: () => void navigate('/bookmarks', { replace: true }) })}
      >
        Delete “{b.title}”? This cannot be undone.
        {remove.error && <ErrorAlert error={remove.error} />}
      </ConfirmDialog>
    </>
  )
}
