# /mutation-check — prove a test actually protects a rule

**What it does.** Breaks a rule in the source on purpose, runs the tests, restores the file, and reports
whether the tests failed. A test that still passes does **not** protect that rule.

**Run it**

```bash
# one rule
.agent/scripts/mutation-check.sh backend/src/collections/collections.service.ts \
  "id_ownerId: { id, ownerId }" "id" -- npm run test:e2e --prefix backend

# a saved set (privacy rules)
.agent/scripts/mutation-check.sh --file .agent/mutants/backend-privacy.tsv -- npm run test:e2e --prefix backend
```

Exit code is non-zero if any mutant survived. Files are always restored (also on Ctrl-C).

**When to invoke it**
- After writing or changing tests that claim to protect a security or correctness rule.
- **Whenever a new test suite passes on the first run** — that is the moment a test is most likely
  passing for the wrong reason.
- Before saying "this is covered" in a document.

**Why it exists.** In this repo it repeatedly found tests that proved nothing:
- the RS256 pin was untested (jose blocks `alg: none`/HS256 by itself) → added a PS256 case;
- a test helper let `SignJWT` setters overwrite the "bad" claims, so four negative tests were sending
  *valid* tokens, and one positive test passed for the wrong reason;
- a frontend regression test passed against the old buggy code, which exposed a wrong claim in a commit message.

**Reading the output.** `caught` = the tests failed, so the rule is protected. `SURVIVED` = write a test
or accept it as an *equivalent mutant* and say so in `DECISIONS.md` (e.g. an owner filter that a
preceding 404 check already makes unreachable).
