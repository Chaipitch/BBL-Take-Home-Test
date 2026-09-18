#!/usr/bin/env node
// Exports a Claude Code session log to transcripts/: a redacted copy of the raw JSONL and a readable
// Markdown version. Redaction is conservative and reported, so nothing is silently dropped.
//
//   node scripts/transcripts/export-transcript.mjs <session.jsonl> <name>
//
// Kept: every user message, assistant text, tool calls with their inputs, tool results (truncated).
// Redacted: JWT-like strings, the test user's password, absolute home paths, Authorization headers.
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import path from 'node:path'

const [source, name] = process.argv.slice(2)
if (!source || !name) {
  console.error('usage: export-transcript.mjs <session.jsonl> <name>')
  process.exit(64)
}

const counts = {}
const count = (key) => (counts[key] = (counts[key] ?? 0) + 1)
// Labels, not pattern sources: the report must not print the secret it looks for.
const RULES = [
  ['JWT-shaped strings', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]'],
  ['test user password (also inside quoted grep patterns)', /@?password1234/g, '[REDACTED_PASSWORD]'],
  ['Authorization: Bearer values', /(Authorization"?\s*[:=]\s*"?Bearer )[^"'\s]+/gi, '$1[REDACTED]'],
  ['absolute home paths', /\/Users\/[^/\s"']+/g, '~'],
]

function redact(value) {
  if (typeof value === 'string') {
    let out = value
    for (const [label, pattern, replacement] of RULES) {
      out = out.replace(pattern, (match, ...rest) => {
        count(label)
        return typeof replacement === 'string' && replacement.includes('$1') ? `${rest[0]}[REDACTED]` : replacement
      })
    }
    return out
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]))
  return value
}

const TRUNCATE = 2000
const clip = (text) => (text.length > TRUNCATE ? `${text.slice(0, TRUNCATE)}\n… [${text.length - TRUNCATE} more characters]` : text)
const fence = (text, lang = '') => `\n\`\`\`${lang}\n${clip(text).replace(/```/g, "'''")}\n\`\`\`\n`

function renderContent(content, lines) {
  if (typeof content === 'string') {
    if (content.trim()) lines.push(clip(content), '')
    return
  }
  for (const block of content ?? []) {
    if (block.type === 'text' && block.text?.trim()) lines.push(clip(block.text), '')
    else if (block.type === 'thinking') lines.push('*(thinking omitted)*', '')
    else if (block.type === 'tool_use') {
      const input = JSON.stringify(block.input ?? {}, null, 1)
      lines.push(`**→ tool: ${block.name}**`, fence(input, 'json'))
    } else if (block.type === 'tool_result') {
      const text = typeof block.content === 'string' ? block.content : (block.content ?? []).map((c) => c.text ?? `[${c.type}]`).join('\n')
      lines.push('**← result**', fence(text))
    }
  }
}

const rawLines = []
const md = [`# Session: ${name}`, '', '_Exported with `scripts/transcripts/export-transcript.mjs`. Secrets redacted (see the report at the end); everything else is as it happened, including the wrong turns._', '']
let turn = 0

const reader = createInterface({ input: createReadStream(source), crlfDelay: Infinity })
for await (const line of reader) {
  let record
  try {
    record = JSON.parse(line)
  } catch {
    continue
  }
  if (!['user', 'assistant'].includes(record.type)) continue
  const safe = redact(record)
  rawLines.push(JSON.stringify(safe))

  const content = safe.message?.content
  const isHuman = safe.type === 'user' && safe.origin?.kind === 'human'
  const out = []
  renderContent(content, out)
  if (out.length === 0) continue
  if (isHuman) md.push(`---`, '', `## ${++turn}. Developer — ${safe.timestamp ?? ''}`, '')
  else if (safe.type === 'user') md.push(`### tool results`, '')
  else md.push(`### Claude`, '')
  md.push(...out)
}

md.push('---', '', '## Redaction report', '', '| What | Replacements |', '|---|---|')
for (const [label, n] of Object.entries(counts)) md.push(`| ${label} | ${n} |`)
if (Object.keys(counts).length === 0) md.push('| (none matched) | 0 |')

const dir = path.join('transcripts', name)
await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, 'session.jsonl'), `${rawLines.join('\n')}\n`)
await writeFile(path.join(dir, 'session.md'), `${md.join('\n')}\n`)
console.log(`wrote ${dir}/session.jsonl and session.md — ${rawLines.length} records, ${turn} developer turns`)
console.log('redactions:', counts)
