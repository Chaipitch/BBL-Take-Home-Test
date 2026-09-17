import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useSaveBookmark } from '../../api/bookmarks'
import { ApiError } from '../../api/client'
import type { Bookmark } from '../../api/types'
import { errorMessage } from '../../api/errorMessage'
import { ALL, CollectionSelect } from './CollectionSelect'

export interface BookmarkFormDialogProps {
  /** Present when editing. */
  bookmark?: Bookmark
  /** Preselected collection when creating from a collection page. */
  defaultCollectionId?: string
  onClose: () => void
  onSaved: (bookmark: Bookmark) => void
}

/**
 * Create (POST) or edit (PUT, full replacement) a bookmark. Field errors come from the API's Problem Details.
 * Mount it only while open, so each opening starts from fresh state.
 */
export function BookmarkFormDialog({ bookmark, defaultCollectionId, onClose, onSaved }: BookmarkFormDialogProps) {
  const save = useSaveBookmark()
  const [url, setUrl] = useState(bookmark?.url ?? '')
  const [title, setTitle] = useState(bookmark?.title ?? '')
  const [notes, setNotes] = useState(bookmark?.notes ?? '')
  const [collectionId, setCollectionId] = useState(bookmark?.collectionId ?? defaultCollectionId ?? ALL)

  const fieldErrors = save.error instanceof ApiError ? save.error.errors : []
  const errorFor = (field: string) => fieldErrors.find((e) => e.field === field)?.message
  const unmappedError = save.error && !['url', 'title', 'notes', 'collectionId'].some((f) => errorFor(f))

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate(
      { id: bookmark?.id, input: { url: url.trim(), title: title.trim(), notes: notes.trim() === '' ? null : notes, collectionId: collectionId === ALL ? null : collectionId } },
      { onSuccess: (saved) => onSaved(saved) },
    )
  }

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={submit} noValidate>
        <DialogTitle>{bookmark ? 'Edit bookmark' : 'New bookmark'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            margin="dense"
            label="URL"
            type="url"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={Boolean(errorFor('url'))}
            helperText={errorFor('url')}
            slotProps={{ htmlInput: { maxLength: 2048 } }}
          />
          <TextField
            fullWidth
            required
            margin="dense"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={Boolean(errorFor('title'))}
            helperText={errorFor('title')}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          <TextField
            fullWidth
            multiline
            minRows={3}
            margin="dense"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={Boolean(errorFor('notes'))}
            helperText={errorFor('notes')}
            slotProps={{ htmlInput: { maxLength: 10000 } }}
          />
          <CollectionSelect mode="form" label="Collection" value={collectionId} onChange={setCollectionId} />
          {errorFor('collectionId') && <Alert severity="error" sx={{ mt: 1 }}>Collection: {errorFor('collectionId')}</Alert>}
          {unmappedError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(save.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={save.isPending || url.trim() === '' || title.trim() === ''}>
            {bookmark ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
