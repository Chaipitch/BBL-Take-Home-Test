import { Link, Typography } from '@mui/material'

import { isSafeHttpUrl } from '../../utils/url'

/** ADR-018k: defence in depth over the API rule — only http(s) URLs become clickable. */
export function SafeLink({ url }: { url: string }) {
  if (!isSafeHttpUrl(url)) {
    return (
      <Typography component="span" variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
        {url}
      </Typography>
    )
  }
  return (
    <Link href={url} target="_blank" rel="noopener noreferrer" variant="body2" sx={{ wordBreak: 'break-all' }}>
      {url}
    </Link>
  )
}
