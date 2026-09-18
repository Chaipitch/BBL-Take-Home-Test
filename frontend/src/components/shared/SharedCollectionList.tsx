import FolderSharedIcon from '@mui/icons-material/FolderSharedOutlined'
import { List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import type { SharedCollection } from '../../api/types'

/** Read-only list: no rename/delete actions (ADR-019e). */
export function SharedCollectionList({ collections }: { collections: SharedCollection[] }) {
  if (collections.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        Nobody has shared a collection with you yet.
      </Typography>
    )
  }
  return (
    <Paper variant="outlined">
      <List disablePadding>
        {collections.map((collection) => (
          <ListItem key={collection.id} divider disablePadding>
            <ListItemButton component={RouterLink} to={`/shared/${collection.id}`}>
              <ListItemIcon>
                <FolderSharedIcon />
              </ListItemIcon>
              <ListItemText
                primary={collection.name}
                secondary={`Shared by ${collection.ownerEmail ?? 'unknown owner'} · ${new Date(collection.sharedAt).toLocaleDateString()}`}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
