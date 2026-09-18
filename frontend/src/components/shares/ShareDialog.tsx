import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText, TextField, Typography,
} from '@mui/material'
import { useState, type FormEvent } from 'react'
import { isExpectedShareProblem, shareErrorMessage, shareFieldError } from '../../api/shareErrorMessage'
import { useCreateShare, useRevokeShare, useShares } from '../../api/shares'
import type { Collection, Share } from '../../api/types'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { ErrorAlert } from '../common/ErrorAlert'
import { LoadMoreButton } from '../common/LoadMoreButton'
import { LoadingState } from '../common/LoadingState'

/**
 * Owner-side sharing (ADR-019b): share by email, see who has access, revoke.
 * Recipients get read-only access (ADR-006f) — there is no "can edit" option by design.
 * Mount only while open.
 */
export function ShareDialog({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const shares = useShares(collection.id)
  const create = useCreateShare(collection.id)
  const revoke = useRevokeShare(collection.id)
  const [email, setEmail] = useState('')
  const [revoking, setRevoking] = useState<Share | null>(null)

  const fieldError = shareFieldError(create.error)
  const rows = shares.data?.pages.flatMap((p) => p.data) ?? []

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(email.trim(), { onSuccess: () => setEmail('') })
  }

  return (
    <>
      <Dialog open onClose={create.isPending ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>Share “{collection.name}”</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            People you share with can read this collection and its bookmarks. They cannot change anything.
          </Typography>
          <form onSubmit={submit} noValidate>
            <TextField
              autoFocus
              fullWidth
              required
              margin="dense"
              type="email"
              label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={Boolean(fieldError)}
              helperText={fieldError}
              slotProps={{ htmlInput: { maxLength: 320 } }}
            />
            {create.error && !fieldError && (
              <Alert severity={isExpectedShareProblem(create.error) ? 'warning' : 'error'} sx={{ mt: 1 }}>
                {shareErrorMessage(create.error)}
              </Alert>
            )}
            <Button type="submit" variant="contained" sx={{ mt: 1 }} disabled={create.isPending || email.trim() === ''}>
              Share
            </Button>
          </form>

          <Typography variant="subtitle2" sx={{ mt: 3 }}>
            Shared with
          </Typography>
          {shares.isLoading && <LoadingState />}
          {shares.error && <ErrorAlert error={shares.error} />}
          {shares.data && rows.length === 0 && (
            <Typography color="text.secondary" variant="body2" sx={{ py: 2 }}>
              Not shared with anyone yet.
            </Typography>
          )}
          <List dense disablePadding>
            {rows.map((share) => (
              <ListItem
                key={share.id}
                divider
                secondaryAction={
                  <IconButton edge="end" aria-label={`Stop sharing with ${share.email ?? 'this person'}`} onClick={() => setRevoking(share)}>
                    <DeleteIcon />
                  </IconButton>
                }
              >
                <ListItemText primary={share.email ?? 'Unknown account'} secondary={`Shared ${new Date(share.createdAt).toLocaleDateString()}`} />
              </ListItem>
            ))}
          </List>
          <LoadMoreButton hasMore={shares.hasNextPage} loading={shares.isFetchingNextPage} onClick={() => void shares.fetchNextPage()} />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={create.isPending}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {revoking && (
        <ConfirmDialog
          open
          title="Stop sharing?"
          confirmLabel="Stop sharing"
          busy={revoke.isPending}
          onCancel={() => setRevoking(null)}
          onConfirm={() => revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
        >
          Stop sharing “{collection.name}” with {revoking.email ?? 'this person'}? They lose access immediately.
          {revoke.error && <ErrorAlert error={revoke.error} />}
        </ConfirmDialog>
      )}
    </>
  )
}
