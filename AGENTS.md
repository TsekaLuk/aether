# AGENTS.md

Scope: this directory and all descendants, unless a deeper `AGENTS.md` overrides it.

Before acting here:

1. Read `INDEX.md` in this directory.
2. Preserve the directory's stated purpose.
3. Keep source code in `code/` or in an explicit repo, not mixed into context folders.
4. Keep temporary, generated, or sensitive material out of long-lived folders unless the local `INDEX.md` says otherwise.
5. Update `INDEX.md` when adding, moving, archiving, or deleting meaningful items.

Default workflow:

- Put unclear inputs in `inbox/`.
- Put Git repositories in `code/`.
- Put current work context in `work/`.
- Put experiments and prototypes in `lab/`.
- Put toolchains, device material, logs, builds, and references in `assets/`.
- Put personal continuity notes in `notes/`.
- Put reusable team-facing outputs in `share/`.
- Move inactive material to `archive/`.

Aether-specific constraints:

- Read `README.md`, `reports/G0.md`, and the relevant Rule IDs before changing semantics.
- Do not start or introduce a production compiler while G0 is `FAIL`.
- Treat `spec/manifests/spec.lock.json` and `reports/G0.*` as generated files; change their inputs, then run `npm test`.
- A semantic change requires an LCP/LDR, compatibility analysis, rule-index update, and conformance evidence.
- Do not add K1/K2 behavior to close a K0 test or gate.
- Keep secrets and GitHub credentials out of the repository.

Index discipline:

- `INDEX.md` is the local map.
- Keep it short, current, and useful for another AI agent.
- Prefer links to duplicated files.
- Use ISO dates: `YYYY-MM-DD`.
