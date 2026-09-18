import { Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useCollectionBookmarks } from '../../api/collections'
import type { Collection } from '../../api/types'
import { BookmarkList } from '../bookmarks/BookmarkList'
import { ErrorAlert } from '../common/ErrorAlert'
import { LoadMoreButton } from '../common/LoadMoreButton'
import { LoadingState } from '../common/LoadingState'

/** One collection with the bookmarks inside it (ADR-020b). Read-only overview: no actions here. */
export function CollectionSection({ collection }: { collection: Collection }) {
  const bookmarks = useCollectionBookmarks(collection.id)
  const rows = bookmarks.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <Stack component="section" aria-label={collection.name} sx={{ mb: 3 }}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1, mb: 1 }}>
        <Link component={RouterLink} to={`/collections/${collection.id}`} variant="h6" underline="hover">
          {collection.name}
        </Link>
        {bookmarks.data && (
          <Typography variant="body2" color="text.secondary">
            {rows.length}
            {bookmarks.hasNextPage ? '+' : ''} bookmark{rows.length === 1 && !bookmarks.hasNextPage ? '' : 's'}
          </Typography>
        )}
      </Stack>
      {bookmarks.isLoading && <LoadingState />}
      {bookmarks.error && <ErrorAlert error={bookmarks.error} />}
      {bookmarks.data && <BookmarkList bookmarks={rows} emptyText="This collection is empty." />}
      <LoadMoreButton hasMore={bookmarks.hasNextPage} loading={bookmarks.isFetchingNextPage} onClick={() => void bookmarks.fetchNextPage()} />
    </Stack>
  )
}
