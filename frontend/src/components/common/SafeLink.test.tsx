import { render, screen } from '@testing-library/react'
import { isSafeHttpUrl } from '../../utils/url'
import { SafeLink } from './SafeLink'

describe('SafeLink (ADR-018k)', () => {
  it.each(['https://example.com', 'http://localhost:3000/x'])('%s is a link opening safely in a new tab', (url) => {
    render(<SafeLink url={url} />)
    const link = screen.getByRole('link', { name: url })
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not a url'])('%s is rendered as plain text, never as a link', (url) => {
    render(<SafeLink url={url} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(isSafeHttpUrl(url)).toBe(false)
  })
})
