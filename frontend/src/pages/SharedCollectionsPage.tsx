import { useSharedCollections } from '../api/shared'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { PageHeader } from '../components/common/PageHeader'
import { SharedCollectionList } from '../components/shared/SharedCollectionList'

/** Collections other people shared with me (ADR-019a). Separate from /collections, which is mine only. */
export function SharedCollectionsPage() {
  const shared = useSharedCollections()
  return (
    <>
      <PageHeader title="Shared with me" />
      {shared.isLoading && <LoadingState />}
      {shared.error && <ErrorAlert error={shared.error} />}
      {shared.data && <SharedCollectionList collections={shared.data.pages.flatMap((p) => p.data)} />}
      <LoadMoreButton hasMore={shared.hasNextPage} loading={shared.isFetchingNextPage} onClick={() => void shared.fetchNextPage()} />
    </>
  )
}
