# AI_WORKFLOW

How this repo was actually built. The transcripts in `/transcripts/` are the raw evidence; this is the summary.

## Tools and models

| | |
|---|---|
| Agent | Claude Code (desktop app), one session, 2026-09-17 → 18 |
| Model | `claude-opus-5` for every one of the 877 assistant messages |
| Tracking | A Notion kanban (one card per task, BBL-1…29) holding decisions, logic and verification per task |
| Repo-side agent config | `CLAUDE.md` (rules), `/.agent/` (mutation-check script, privacy-review prompt, pre-commit hook), `DECISIONS.md` (ADRs) |
| Human-only steps | Every Auth0 login (the agent never types the password), and every design decision |

## How the work was decomposed

1. **Read the brief, then check the ground.** Environment audit, then the Auth0 tenant's discovery document and JWKS *before* any auth design (the brief asks for this; it also changed the design — see below).
2. **One task per card**, each of them: *proposal → developer decision → implement → verify → record*. The proposal lists options with trade-offs; the decision is written into `DECISIONS.md` as an ADR with who decided; the implementation follows the accepted option only.
3. **Contract before endpoints.** `API_DESIGN.md` was written and accepted before the collections and bookmarks endpoints, so tests could check documented status codes rather than whatever the code happened to do.
4. **Every claim gets a runnable check**, then the check itself gets attacked (mutation testing).
5. **Docs updated in the same commit as the code** they describe.

## What the AI did well

- **Reading sources instead of recalling them.** It found in the tenant's JWKS that only RS256 keys exist although the discovery document advertises HS256 and PS256; in the `@auth0/auth0-spa-js` source that only `response_type=code` + `S256` are possible; in Nest's source that `StandardSchemaValidationPipe` **silently skips** a parameter with no schema. Each fact changed the design or added a guardrail.
- **Turning "is this covered?" into an experiment.** The Prisma `upsert` race was measured (171/200 parallel first sign-ins failed with an empty `update`, 0/200 with a non-empty one) instead of argued about.
- **Mechanical thoroughness where it pays.** 144 backend e2e tests, 64 backend unit tests, 41 frontend tests, a 71-request Postman collection, and mutation checks for every security rule — each cross-user case spelled out per route rather than sampled.

## Where the AI failed, and how it was caught

1. **It designed on its own.** After three accepted decisions it wrote a schema full of unapproved sub-decisions (composite FK, share-by-email semantics, field limits). The developer stopped it: *"Please dont start designing code on your own. explain what you think and let me decide."* Recovery: those items were reclassified as *Proposed* in `DECISIONS.md` (commit `e781d58`), a propose→decide→implement rule went into `CLAUDE.md`, and every later task followed it.
2. **It proposed something against the brief.** It recommended omitting `ownerId` from responses although the brief's suggested shape includes it. Developer: *"dont go against the brief."* Recovery: reverted to the brief's shape, plus a standing rule to check proposals against the brief first (commit `b327dd6`).
3. **Its tests passed for the wrong reasons — twice.** (a) A token-signing helper let `SignJWT` setters overwrite the "bad" claims, so four negative auth tests were sending *valid* tokens and one positive test passed by accident. (b) A frontend regression test passed against the buggy code it was meant to catch, which also proved a claim in the agent's own commit message wrong. Recovery: mutation testing became routine, and the wrong claim was corrected in `DECISIONS.md` rather than quietly dropped.
4. **It nearly shipped a misleading failure mode.** The first auth design mapped all `jose` errors to `401`; reading `jose`'s source showed a generic error is thrown when the JWKS endpoint returns non-200, so an Auth0 outage would have logged everyone out. Fixed to `503` with explicit error-code classification.
5. **It diagnosed a flaky suite wrongly at first.** ~20% of e2e runs failed with random 401/404/parse errors. The keep-alive hypothesis was tested and **disproved**, then the real cause found: supertest starting a server per request on `::` while other local apps hold the same ports on `127.0.0.1`. Fixed by binding the test app to loopback once (0 failures in 40 runs).

## A prompt that worked, and one that didn't

**Worked — the developer's correction (turn 5):**

> "Please dont start designing code on your own. explain what you think and let me decide. Also ducoment it in DECISION.md"

Short, and it changed the whole method: from then on every task produced a written proposal with options and a recommendation, the developer chose, and the ADR recorded who decided. It is also the reason the submission can be defended — the reasoning exists in writing, per decision.

**Didn't work — the agent's own first mutation-check run.** It ran the saved privacy mutants with only the e2e suite and reported four "unprotected" rules. Three were fine, proved by the *unit* suite; one was a documented equivalent mutant. The prompt/tool was wrong, not the code. Fix: mutant files now carry their own `#test:` command and can mark expected survivors, so the report means what it says.

**Also didn't work:** the plain instruction *"write tests for this"*. It produced suites that passed immediately and proved less than they appeared to. Replacing it with *"write the test, then delete the rule it protects and show me the failure"* is what caught items 3 and 4 above.

## Cost and token awareness

Measured from the session log (`usage` fields of all 877 assistant messages):

| | |
|---|---|
| Output tokens | ~1.81 M |
| Cache **writes** | ~4.17 M |
| Cache **reads** | ~375.5 M |
| Uncached input | 1,760 |
| Tool calls | 398 (239 Bash, 78 Notion updates, 50 file writes/edits, 5 developer questions) |

Practically all input was served from the prompt cache (~375 M cache reads vs 1,760 uncached input tokens), which is what makes a long single session affordable: the repo context is written once and re-read cheaply. Where cost was consciously managed:

- **Long outputs go to files, not the chat** (docs, tests, scripts) — they are then read back by the tools that need them.
- **Targeted reads.** `grep`/`sed` ranges instead of whole files; `npm view` for one field instead of downloading package documentation.
- **Expensive checks run on purpose, not by habit.** The 12-mutant privacy set re-runs a 144-test suite 12 times (~4 minutes); it is run when tests for a rule change, not on every commit — the pre-commit hook runs only type-check, lint and unit tests.
- **One session, not many.** Re-explaining the repo to a fresh session would have cost more than the cache reads; `CLAUDE.md` exists so that a fresh session is cheap when it does happen.

## What a reviewer should read first

1. `DECISIONS.md` — every choice, who made it, and the alternatives.
2. `API_DESIGN.md` §7 — the privacy invariant and which test proves each rule.
3. `/.agent/README.md` — the capabilities and what they caught.
4. `/transcripts/01-build-2026-09-17/session.md` — the raw work, including the two developer corrections above.
