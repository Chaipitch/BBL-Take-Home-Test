#!/usr/bin/env node
// Creates real Auth0 accounts through the tenant's public sign-up endpoint, so you can log into the
// UI as several different people. You type the password; this script never stores, logs or echoes it.
//
//   node scripts/create-auth0-user.mjs --email you+test1@gmail.com
//   node scripts/create-auth0-user.mjs --email "you+test{n}@gmail.com" --count 3 --name "Tester {n}"
//   echo "$PASSWORD" | node scripts/create-auth0-user.mjs --email you+ci@gmail.com --password-stdin
//
// Notes
// - Accounts are created in Bangkok Bank's tenant. Use addresses you can read: Auth0 sends a
//   verification link, and a share recipient must have a verified email (ADR-006b).
// - The app itself needs no "create user" step: a User row appears on the first authenticated request.
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'

const DOMAIN = 'https://dev-yg.us.auth0.com'
const CLIENT_ID = 'H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA'
const CONNECTION = 'Username-Password-Authentication'

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const emailTemplate = arg('email')
const nameTemplate = arg('name')
const count = Number(arg('count', '1'))
const fromStdin = process.argv.includes('--password-stdin')

if (!emailTemplate || !Number.isInteger(count) || count < 1) {
  console.error('usage: create-auth0-user.mjs --email <address, may contain {n}> [--count N] [--name "…{n}"] [--password-stdin]')
  process.exit(64)
}
if (count > 1 && !emailTemplate.includes('{n}')) {
  console.error('with --count > 1 the email must contain {n}, e.g. --email "you+test{n}@gmail.com"')
  process.exit(64)
}

/** Reads a password without echoing it. Not stored anywhere, not passed on the command line. */
async function readPassword() {
  if (fromStdin) {
    const chunks = []
    for await (const chunk of stdin) chunks.push(chunk)
    return chunks.join('').trim()
  }
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  const answer = await new Promise((resolve) => {
    const onData = (char) => {
      // Re-print the prompt without the typed characters.
      if (![`\r`, `\n`, ``].includes(char.toString())) stdout.write(`[2K[200DPassword (hidden): `)
    }
    stdin.on('data', onData)
    rl.question('Password (hidden): ', (value) => {
      stdin.off('data', onData)
      stdout.write('\n')
      resolve(value)
    })
  })
  rl.close()
  return answer.trim()
}

const fill = (template, n) => template?.replaceAll('{n}', String(n))

async function signUp(email, name, password) {
  const response = await fetch(`${DOMAIN}/dbconnections/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, connection: CONNECTION, email, password, ...(name ? { name } : {}) }),
  })
  const body = await response.json().catch(() => ({}))
  if (response.ok) return { ok: true, id: body._id ?? body.user_id, emailVerified: body.email_verified === true }
  // Auth0 hides "already registered" behind invalid_signup on purpose.
  const reason =
    body.code === 'invalid_signup' ? 'invalid signup (the address may already be registered)' : body.description ?? body.error ?? `HTTP ${response.status}`
  return { ok: false, reason }
}

const password = await readPassword()
if (!password) {
  console.error('No password given; nothing was created.')
  process.exit(64)
}

let created = 0
for (let n = 1; n <= count; n++) {
  const email = fill(emailTemplate, n)
  const result = await signUp(email, fill(nameTemplate, n), password)
  if (result.ok) {
    created++
    console.log(`created  ${email}  (auth0 id ${result.id}, email_verified: ${result.emailVerified})`)
  } else {
    console.log(`failed   ${email}  — ${result.reason}`)
  }
}

console.log(`\n${created}/${count} account(s) created.`)
if (created > 0) {
  console.log('Next: open the inbox for each address and click Auth0\'s verification link — an unverified')
  console.log('email cannot receive shares (ADR-006b). Then sign in: the app creates the user on first request.')
  console.log('Tip: node scripts/inspect-tokens.mjs --switch-account  forces the Auth0 login screen.')
}
