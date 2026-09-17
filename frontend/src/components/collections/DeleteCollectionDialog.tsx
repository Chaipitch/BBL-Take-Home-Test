import { Alert } from '@mui/material'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useDeleteCollection } from '../../api/collections'
import type { Collection } from '../../api/types'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { errorMessage } from '../../api/errorMessage'

export interface DeleteCollectionDialogProps {
  collection: Collection
  onClose: () => void
  onDeleted: () => void
}

/**
 * ADR-005/005b, ADR-018i: confirm → DELETE. An empty collection is deleted (204). A non-empty one
 * answers 409 with the exact bookmarkCount; the dialog then asks again and retries with confirm=true.
 * Mount it only while open (keyed by collection id), so the 409 step never carries over.
 */
export function DeleteCollectionDialog({ collection, onClose, onDeleted }: DeleteCollectionDialogProps) {
  const remove = useDeleteCollection()
  const [bookmarkCount, setBookmarkCount] = useState<number | null>(null)

  const confirmNeeded = bookmarkCount !== null
  const onConfirm = () =>
    remove.mutate(
      { id: collection.id, confirm: confirmNeeded },
      {
        onSuccess: onDeleted,
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'collection_not_empty' && typeof error.bookmarkCount === 'number') {
            setBookmarkCount(error.bookmarkCount)
            remove.reset()
          }
        },
      },
    )

  return (
    <ConfirmDialog
      open
      title={confirmNeeded ? 'Delete collection and its bookmarks?' : 'Delete collection?'}
      confirmLabel={confirmNeeded ? `Delete collection and ${bookmarkCount} bookmark${bookmarkCount === 1 ? '' : 's'}` : 'Delete'}
      busy={remove.isPending}
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      {confirmNeeded ? (
        <>
          “{collection.name}” contains <strong>{bookmarkCount}</strong> bookmark{bookmarkCount === 1 ? '' : 's'}. They will be deleted too. This cannot be undone.
        </>
      ) : (
        <>Delete “{collection.name}”? This cannot be undone.</>
      )}
      {remove.error && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(remove.error)}</Alert>}
    </ConfirmDialog>
  )
}
