import { Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
      <Typography variant="h4" component="h1">
        {title}
      </Typography>
      {actions && <Stack direction="row" sx={{ gap: 1 }}>{actions}</Stack>}
    </Stack>
  )
}
