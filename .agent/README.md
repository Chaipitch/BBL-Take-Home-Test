# /.agent — capabilities used while building this repo

Three things an agent (or a person) can run here. Each one exists because it caught something real in
this build; the commands section of each file says when to invoke it.

| Capability | File | Invoke when |
|---|---|---|
| **Mutation check** | `commands/mutation-check.md`, `scripts/mutation-check.sh`, `mutants/*.tsv` | After writing tests that claim to protect a rule — especially when a new suite passes on the first run |
| **Privacy review** | `commands/privacy-review.md` | Before committing any change to a query, controller, route or the auth guard |
| **Pre-commit hook** | `hooks/pre-commit` | Automatically, on every commit |

Agent rules for the repo live in `CLAUDE.md`; decisions in `DECISIONS.md`.

## 1. Mutation check — "prove the test protects the rule"

```bash
.agent/scripts/mutation-check.sh --file .agent/mutants/backend-auth.tsv       # unit suite
.agent/scripts/mutation-check.sh --file .agent/mutants/backend-privacy.tsv    # e2e suite (needs Postgres)
.agent/scripts/mutation-check.sh <file> <search> <replace> -- <test command>  # ad hoc
```

It breaks the rule, runs the tests, **restores the file** (also on Ctrl-C), and reports `caught` or
`SURVIVED`. Non-zero exit if any result was unexpected. A mutant can be marked `survive` in the fifth
column when it is a documented *equivalent* mutant, so known-unreachable code doesn't look like a hole.
Each mutant file carries its own `#test:` command, because a rule proved by unit tests is invisible to
the e2e suite (found while building this: running the auth mutants against e2e reported false survivors).

Current state, both sets green:

```
backend-auth.tsv     5 mutants, 0 unexpected   (audience, issuer, RS256 pin, exp required, outage vs invalid token)
backend-privacy.tsv  9 mutants, 0 unexpected   (owner filters on read/list/delete, share ownership + verified
                                                recipients, grantee filters; 1 documented equivalent mutant)
```

**What it found here:** the RS256 pin had no test (jose blocks `none`/HS256 itself) → added a PS256 case;
a test helper let `SignJWT` setters overwrite the "bad" claims, so four negative tests were sending valid
tokens; a frontend regression test passed against the old buggy code, which exposed a wrong claim in a
commit message (corrected in `DECISIONS.md`).

## 2. Privacy review — checklist prompt for data-access changes

`commands/privacy-review.md` holds the invariant and eight questions to answer with quoted lines
("which test fails if this rule is removed?" among them). Paste it with a diff, or run it as a subagent
task. It is the reason the ownership check runs **before** the email lookup in share creation, so
`recipient_not_found` can't be probed through someone else's collection.

## 3. Pre-commit hook

```bash
ln -sf ../../.agent/hooks/pre-commit .git/hooks/pre-commit   # installed in this clone
```

Type-check, lint and unit tests for the workspaces that changed (e2e needs Postgres and runs separately).
Verified by trying to commit a deliberate type error: the commit was rejected; the clean commit that added
these files passed. Bypass with `git commit --no-verify` only with a reason in the message.
