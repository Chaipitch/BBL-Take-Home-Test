import SearchIcon from '@mui/icons-material/Search'
import { IconButton, InputAdornment, Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { CollectionSelect } from './CollectionSelect'

export interface BookmarkFiltersProps {
  collectionId: string
  search: string
  onChange: (next: { collectionId: string; search: string }) => void
}

/**
 * Filter by collection (incl. Uncategorised) and full-text search over titles and notes (ADR-020c);
 * state lives in the URL (ADR-018h). The search box is a draft; the parent remounts it (key) on URL change.
 */
export function BookmarkFilters({ collectionId, search: initial, onChange }: BookmarkFiltersProps) {
  const [search, setSearch] = useState(initial)

  function submit(event: FormEvent) {
    event.preventDefault()
    onChange({ collectionId, search: search.trim() })
  }

  return (
    <Stack component="form" onSubmit={submit} direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, mb: 2 }} role="search">
      <CollectionSelect mode="filter" label="Collection" value={collectionId} onChange={(value) => onChange({ collectionId: value, search })} />
      <TextField
        fullWidth
        margin="dense"
        label="Search titles and notes"
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
