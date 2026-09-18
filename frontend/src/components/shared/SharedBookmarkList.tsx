import { List, ListItem, ListItemText, Paper, Typography } from '@mui/material'
import type { SharedBookmark } from '../../api/types'
import { SafeLink } from '../common/SafeLink'

/**
 * Read-only bookmarks of a shared collection (ADR-019e): notes are shown inline because
 * /bookmarks/:id is an owner-only route and would 404 for a recipient. No edit or delete actions.
 */
export function SharedBookmarkList({ bookmarks, emptyText = 'This collection has no bookmarks.' }: { bookmarks: SharedBookmark[]; emptyText?: string }) {
  if (bookmarks.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>{emptyText}</Typography>
  }
  return (
    <Paper variant="outlined">
      <List disablePadding>
        {bookmarks.map((bookmark) => (
          <ListItem key={bookmark.id} divider alignItems="flex-start">
            <ListItemText
              disableTypography
              primary={<Typography variant="subtitle1">{bookmark.title}</Typography>}
              secondary={
                <>
                  <SafeLink url={bookmark.url} />
                  {bookmark.notes && (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                      {bookmark.notes}
                    </Typography>
                  )}
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
