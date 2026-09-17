import SearchIcon from '@mui/icons-material/Search'
import { IconButton, InputAdornment, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { CollectionSelect } from './CollectionSelect'

export interface BookmarkFiltersProps {
  collectionId: string
  q: string
  onChange: (next: { collectionId: string; q: string }) => void
}

/**
 * Filter by collection (incl. Uncategorised) and title search; state lives in the URL (ADR-018h).
 * The search box is a draft of `q`; the parent remounts this component (key) when the URL changes.
 */
export function BookmarkFilters({ collectionId, q, onChange }: BookmarkFiltersProps) {
  const [search, setSearch] = useState(q)

  function submit(event: FormEvent) {
    event.preventDefault()
    onChange({ collectionId, q: search.trim() })
  }

  return (
    <Stack component="form" onSubmit={submit} direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, mb: 2 }} role="search">
      <CollectionSelect mode="filter" label="Collection" value={collectionId} onChange={(value) => onChange({ collectionId: value, q })} />
      <TextField
        fullWidth
        margin="dense"
        label="Search titles"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
