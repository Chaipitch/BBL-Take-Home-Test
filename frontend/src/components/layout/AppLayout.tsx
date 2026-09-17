import { useAuth0 } from '@auth0/auth0-react'
import BookmarksIcon from '@mui/icons-material/Bookmarks'
import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import { NavLink, Outlet } from 'react-router'
import { useMe } from '../../api/me'

const navButtonSx = { color: 'inherit', '&.active': { textDecoration: 'underline', textUnderlineOffset: '6px' } }

export function AppLayout() {
  const { logout } = useAuth0()
  const me = useMe()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2 }}>
          <BookmarksIcon />
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            Bookmarks
          </Typography>
          <Button component={NavLink} to="/collections" sx={navButtonSx}>
            Collections
          </Button>
          <Button component={NavLink} to="/bookmarks" sx={navButtonSx}>
            Bookmarks
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          {me.data?.email && (
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {me.data.email}
            </Typography>
          )}
          <Button color="inherit" onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}>
            Log out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </Box>
  )
}
