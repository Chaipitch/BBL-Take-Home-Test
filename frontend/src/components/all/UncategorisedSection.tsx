import { Stack, Typography } from '@mui/material'
import { useBookmarks } from '../../api/bookmarks'
import { BookmarkList } from '../bookmarks/BookmarkList'
import { ErrorAlert } from '../common/ErrorAlert'
import { LoadMoreButton } from '../common/LoadMoreButton'
import { LoadingState } from '../common/LoadingState'

/** Bookmarks with no collection (`?collectionId=none`), so the overview shows everything. */
export function UncategorisedSection() {
  const bookmarks = useBookmarks({ collectionId: 'none' })
  const rows = bookmarks.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <Stack component="section" aria-label="Uncategorised" sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Uncategorised
      </Typography>
      {bookmarks.isLoading && <LoadingState />}
      {bookmarks.error && <ErrorAlert error={bookmarks.error} />}
      {bookmarks.data && <BookmarkList bookmarks={rows} emptyText="No uncategorised bookmarks." />}
      <LoadMoreButton hasMore={bookmarks.hasNextPage} loading={bookmarks.isFetchingNextPage} onClick={() => void bookmarks.fetchNextPage()} />
    </Stack>
  )
}
