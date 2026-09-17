import { Box, CircularProgress, Typography } from '@mui/material'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 4, justifyContent: 'center' }}>
      <CircularProgress size={24} />
      <Typography color="text.secondary">{label}</Typography>
    </Box>
  )
}
