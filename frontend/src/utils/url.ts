/** ADR-018k: only http(s) URLs may be rendered as clickable links. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
