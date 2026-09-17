import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useApi } from '../../api/useApi'
import { ApiError } from '../../api/client'
import { findDuplicateCollection, useSaveCollection } from '../../api/collections'
import type { Collection } from '../../api/types'
import { errorMessage } from '../../api/errorMessage'

export interface CollectionFormDialogProps {
  /** Present when renaming. */
  collection?: Collection
  onClose: () => void
  onSaved: (collection: Collection) => void
}

/**
 * Create or rename a collection. Duplicate names are allowed by the API (ADR-007), so the form warns
 * first and lets the user continue (ADR-018j: exact, case-insensitive match checked via the API).
 * Mount it only while open, so each opening starts from fresh state.
 */
export function CollectionFormDialog({ collection, onClose, onSaved }: CollectionFormDialogProps) {
  const api = useApi()
  const save = useSaveCollection()
  const [name, setName] = useState(collection?.name ?? '')
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const fieldError = save.error instanceof ApiError ? save.error.errors.find((e) => e.field === 'name')?.message : undefined
  const busy = checking || save.isPending

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (duplicateOf === null) {
      setChecking(true)
      try {
        const duplicate = await findDuplicateCollection(api, trimmed, collection?.id)
        if (duplicate) {
          setDuplicateOf(duplicate.name)
          return
        }
      } finally {
        setChecking(false)
      }
    }
    save.mutate({ id: collection?.id, name: trimmed }, { onSuccess: (saved) => onSaved(saved) })
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <form onSubmit={(e) => void submit(e)} noValidate>
        <DialogTitle>{collection ? 'Rename collection' : 'New collection'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            required
            margin="dense"
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDuplicateOf(null)
            }}
            error={Boolean(fieldError)}
            helperText={fieldError}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {duplicateOf !== null && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              A collection named “{duplicateOf}” already exists. Saving will create identical collection names.
            </Alert>
          )}
          {save.error && !fieldError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(save.error)}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || name.trim() === ''}>
            {duplicateOf !== null ? 'Save anyway' : collection ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
