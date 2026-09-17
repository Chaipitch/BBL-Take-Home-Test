import AddIcon from '@mui/icons-material/Add'
import { Button } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCollections } from '../api/collections'
import type { Collection } from '../api/types'
import { CollectionFormDialog } from '../components/collections/CollectionFormDialog'
import { CollectionList } from '../components/collections/CollectionList'
import { DeleteCollectionDialog } from '../components/collections/DeleteCollectionDialog'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { PageHeader } from '../components/common/PageHeader'

/** Brief §3.2: list your collections, view one (link), create, delete. */
export function CollectionsPage() {
  const navigate = useNavigate()
  const collections = useCollections()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Collection | null>(null)

  return (
    <>
      <PageHeader
        title="Collections"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New collection
          </Button>
        }
      />
      {collections.isLoading && <LoadingState />}
      {collections.error && <ErrorAlert error={collections.error} />}
      {collections.data && <CollectionList collections={collections.data.pages.flatMap((p) => p.data)} onDelete={setDeleting} />}
      <LoadMoreButton hasMore={collections.hasNextPage} loading={collections.isFetchingNextPage} onClick={() => void collections.fetchNextPage()} />

      {creating && (
        <CollectionFormDialog
          onClose={() => setCreating(false)}
          onSaved={(saved) => {
            setCreating(false)
            void navigate(`/collections/${saved.id}`)
          }}
        />
      )}
      {deleting && <DeleteCollectionDialog key={deleting.id} collection={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
    </>
  )
}
