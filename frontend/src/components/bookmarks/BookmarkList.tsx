import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { Chip, IconButton, Link, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import type { Bookmark, Collection } from '../../api/types'
import { SafeLink } from '../common/SafeLink'

export interface BookmarkListProps {
  bookmarks: Bookmark[]
  /** For showing the collection name; omit on a collection's own page. */
  collections?: Collection[]
  emptyText?: string
  /** Omit for read-only contexts (e.g. the /all overview). */
  onDelete?: (bookmark: Bookmark) => void
}

export function BookmarkList({ bookmarks, collections, emptyText = 'No bookmarks.', onDelete }: BookmarkListProps) {
  if (bookmarks.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{emptyText}</Typography>
  }
  const nameOf = (id: string | null) => (id ? collections?.find((c) => c.id === id)?.name : undefined)

  return (
    <Paper variant="outlined">
      <List disablePadding>
        {bookmarks.map((bookmark) => (
          <ListItem
            key={bookmark.id}
            divider
            alignItems="flex-start"
            secondaryAction={
              onDelete && (
                <IconButton edge="end" aria-label={`Delete ${bookmark.title}`} onClick={() => onDelete(bookmark)}>
                  <DeleteIcon />
                </IconButton>
              )
            }
          >
            <ListItemText
              disableTypography
              sx={{ pr: onDelete ? 4 : 0 }}
              primary={
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Link component={RouterLink} to={`/bookmarks/${bookmark.id}`} variant="subtitle1" underline="hover">
                    {bookmark.title}
                  </Link>
                  {collections && (
                    <Chip size="small" variant="outlined" label={nameOf(bookmark.collectionId) ?? (bookmark.collectionId ? 'Collection' : 'Uncategorised')} />
                  )}
                </Stack>
              }
              secondary={<SafeLink url={bookmark.url} />}
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
