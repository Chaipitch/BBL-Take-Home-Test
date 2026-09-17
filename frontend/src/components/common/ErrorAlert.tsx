import { Alert, AlertTitle } from '@mui/material'
import { errorMessage } from '../../api/errorMessage'

export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  return (
    <Alert severity="error" sx={{ my: 2 }}>
      {title && <AlertTitle>{title}</AlertTitle>}
      {errorMessage(error)}
    </Alert>
  )
}
