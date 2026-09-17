import { Link, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'

export function NotFoundPage() {
  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Page not found
      </Typography>
      <Link component={RouterLink} to="/collections">
        Go to collections
      </Link>
    </>
  )
}
