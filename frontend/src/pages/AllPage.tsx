import { Alert, Divider } from '@mui/material'
import { useCollections } from '../api/collections'
import { CollectionSection } from '../components/all/CollectionSection'
import { UncategorisedSection } from '../components/all/UncategorisedSection'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { PageHeader } from '../components/common/PageHeader'

/**
 * Bonus (brief §3.4): collections together with the bookmarks inside them, instead of two lists.
 * Built on the existing endpoints (ADR-020b): one request per collection, plus uncategorised.
 */
export function AllPage() {
  const collections = useCollections(100)
  const rows = collections.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <>
      <PageHeader title="Everything" />
      {collections.isLoading && <LoadingState />}
      {collections.error && <ErrorAlert error={collections.error} />}
      {collections.hasNextPage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing the first {rows.length} collections. Open <strong>Collections</strong> to page through the rest.
        </Alert>
      )}
      {rows.map((collection) => (
        <CollectionSection key={collection.id} collection={collection} />
      ))}
      {collections.data && <Divider sx={{ my: 2 }} />}
      {collections.data && <UncategorisedSection />}
    </>
  )
}
