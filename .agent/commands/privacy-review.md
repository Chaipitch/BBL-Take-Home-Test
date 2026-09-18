# /privacy-review — review a change against the privacy invariant

**Invariant (brief §3).** Everything is private to the person who created it. A user must never see,
modify, or learn of the *existence* of another user's data. One documented exception: collections the
owner shared read-only (ADR-006), served only under `/shared/...`.

**When to invoke it**
- Before committing any change that touches a Prisma query, a controller, a route, or the auth guard.
- Before writing a claim about privacy in `API_DESIGN.md` or `README.md`.

**Prompt (paste with the diff, or run as a subagent task)**

> Review this diff against the privacy invariant above. Answer each point with the exact line or
> "not applicable", and do not accept an explanation that the tests already pass.
> 1. Does every query on owned data filter by `ownerId` taken from the verified token? Quote the lines.
> 2. Can a caller influence `ownerId` through body, query or path? What rejects it?
> 3. Do "not found", "not yours" and "malformed id" produce byte-identical responses?
> 4. Can the change reveal that another user's row exists — through a status code, an error message,
>    a count, a timing difference, a filter result, or a cursor?
> 5. Do writes match on id **and** owner in one statement (no read-then-write gap)?
> 6. Does anything outside `SharedService` read `CollectionShare`? Does any shared route write?
> 7. Which test fails if this rule is removed? If none, run `/mutation-check` and report the result.
> 8. Does any response include another user's id, email or internal field?
>
> Finish with: `PASS` plus the protecting tests, or `FIX` plus the smallest change needed.

**Why it exists.** Used before each endpoint commit. It caught, among others: a bookmark filter that
would have needed a 404 instead of an empty page; `recipient_not_found` leaking through someone
else's collection (now the ownership check runs first); and it forces the "which test fails?" question
that produced the mutation checks recorded in `DECISIONS.md`.
