import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import { IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import type { Collection } from '../../api/types'

export function CollectionList({ collections, onDelete }: { collections: Collection[]; onDelete: (collection: Collection) => void }) {
  if (collections.length === 0) {
    return <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No collections yet.</Typography>
  }
  return (
    <Paper variant="outlined">
      <List disablePadding>
        {collections.map((collection) => (
          <ListItem
            key={collection.id}
            divider
            disablePadding
            secondaryAction={
              <IconButton edge="end" aria-label={`Delete ${collection.name}`} onClick={() => onDelete(collection)}>
                <DeleteIcon />
              </IconButton>
            }
          >
            <ListItemButton component={RouterLink} to={`/collections/${collection.id}`}>
              <ListItemIcon>
                <FolderIcon />
              </ListItemIcon>
              <ListItemText primary={collection.name} secondary={`Created ${new Date(collection.createdAt).toLocaleDateString()}`} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Paper>
  )
}
