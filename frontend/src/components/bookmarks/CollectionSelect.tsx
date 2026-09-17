import { MenuItem, TextField } from '@mui/material'
import { useCollections } from '../../api/collections'

export const ALL = ''
export const UNCATEGORISED = 'none'

export interface CollectionSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Filter mode adds "All"; form mode offers "No collection". */
  mode: 'filter' | 'form'
  disabled?: boolean
}

/** Options come from the first 100 collections (API max page size); enough for this app's scale. */
export function CollectionSelect({ label, value, onChange, mode, disabled }: CollectionSelectProps) {
  const collections = useCollections(100)
  const options = collections.data?.pages.flatMap((p) => p.data) ?? []
  // A value outside the loaded options (e.g. the 101st collection) must stay selected; coercing it to
  // "No collection" would silently uncategorise a bookmark when its edit form is saved.
  const unknownValue = value !== ALL && value !== UNCATEGORISED && !options.some((c) => c.id === value)

  return (
    <TextField
      select
      fullWidth
      margin="dense"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {mode === 'filter' && <MenuItem value={ALL}>All bookmarks</MenuItem>}
      <MenuItem value={mode === 'filter' ? UNCATEGORISED : ALL}>{mode === 'filter' ? 'Uncategorised' : 'No collection'}</MenuItem>
      {unknownValue && <MenuItem value={value}>{collections.isLoading ? 'Loading…' : 'Current collection'}</MenuItem>}
      {options.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.name}
        </MenuItem>
      ))}
    </TextField>
  )
}
