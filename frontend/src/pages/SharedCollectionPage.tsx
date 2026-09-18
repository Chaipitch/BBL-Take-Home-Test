import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SearchIcon from '@mui/icons-material/Search'
import { Chip, IconButton, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router'
import { useSharedBookmarks, useSharedCollection } from '../api/shared'
import { ErrorAlert } from '../components/common/ErrorAlert'
import { LoadingState } from '../components/common/LoadingState'
import { LoadMoreButton } from '../components/common/LoadMoreButton'
import { PageHeader } from '../components/common/PageHeader'
import { SharedBookmarkList } from '../components/shared/SharedBookmarkList'

function SearchBox({ q, onSubmit }: { q: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState(q)
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(value.trim())
  }
  return (
    <Stack component="form" onSubmit={submit} role="search" sx={{ mb: 2 }}>
      <TextField
        margin="dense"
        label="Search titles"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        slotProps={{
          htmlInput: { maxLength: 500 },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton type="submit" aria-label="Search" edge="end">
                  <SearchIcon />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    </Stack>
  )
}

/** A collection shared with me: read-only (ADR-019e). No edit, delete, add or re-share actions exist. */
export function SharedCollectionPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const collection = useSharedCollection(id)
  const bookmarks = useSharedBookmarks(id, q || undefined)

  const back = (
    <Link component={RouterLink} to="/shared" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
      <ArrowBackIcon fontSize="small" /> Shared with me
    </Link>
  )

  if (collection.isLoading) return <LoadingState />
  if (collection.error || !collection.data) {
    return (
      <>
        {back}
        {collection.error ? (
          <Typography color="text.secondary">Not found. It may have been deleted, or it is no longer shared with you.</Typography>
        ) : null}
      </>
    )
  }

  return (
    <>
      {back}
      <PageHeader title={collection.data.name} actions={<Chip label="Read-only" size="small" />} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Shared by {collection.data.ownerEmail ?? 'unknown owner'} on {new Date(collection.data.sharedAt).toLocaleDateString()}
      </Typography>
      <SearchBox key={q} q={q} onSubmit={(value) => setParams(value ? { q: value } : {})} />
      {bookmarks.isLoading && <LoadingState />}
      {bookmarks.error && <ErrorAlert error={bookmarks.error} />}
      {bookmarks.data && (
        <SharedBookmarkList
          bookmarks={bookmarks.data.pages.flatMap((p) => p.data)}
          emptyText={q ? 'No bookmarks match this search.' : 'This collection has no bookmarks.'}
        />
      )}
      <LoadMoreButton hasMore={bookmarks.hasNextPage} loading={bookmarks.isFetchingNextPage} onClick={() => void bookmarks.fetchNextPage()} />
    </>
  )
}
