# Experiment Log

## 2026-08-10

- Imported Aether PRD v0.1-v0.3 and the v0.4 executable K0 specification.
- Confirmed 380 parent PRD Rule IDs are machine-recognizable.
- Corrected the original rule metric: 19 K0/MEM rules, not 21, had executable
  evidence because two indexed entries were `CONF-*` rules.
- Indexed all 69 K0/MEM rules and recorded a concrete evidence gap on the 50
  rules that still lack executable conformance evidence.
- Ran 14 conformance vectors through independent Node and Python state machines;
  all 14 results agreed with each other and the hand-authored semantic oracle.
- Verified `spec.lock` is reproducible across repeated local runs.
- Kept G0 at `FAIL`; tests were not promoted to formal proofs.
- Validated the independent Python executor on the local 3.9.6 host and declared
  3.9.25 as the Ubuntu CI profile within the locked Python 3.9 compatibility family.
- Identified five blocking workstreams: complete Core semantics, complete resource
  states, rule coverage, mechanized metatheory, and K0 layer-isolation proof.
- Implemented proposed LCP-0001 as a draft-breaking grammar experiment: `init`
  construction, explicit dereference, public lifetime labels, type invariants,
  and a total contract-expression subgrammar. Independent LCP-008 review and
  owner approval remain outstanding.
- Ran 77 source cases and two invalid UTF-8 byte cases through independent Node
  and Python parsers; canonical trees and diagnostics agreed in every case.
- Rejected 55 generated reserved-token placements and 9 structured ASR/Core
  smuggling probes, plus 6 forbidden package manifests; kept G0-08 failed because
  resolved-ASR reachability is not yet proved.
- Implemented proposed LCP-0002 as a draft name-resolution experiment. Independent
  Node and Python implementations agreed on 38 package inputs, including forward
  and recursive references, module/variant ambiguity, visibility, scope,
  lifetime origin, contracts, target names, duplicates, and package entry.
- Validated 11 resolver outputs against a closed recursive ASR schema and an
  independently recomputed identity/reference-closure audit. Rejected all 6
  schema-valid identity tampering mutations. This does not establish field
  resolution, ASR-to-Core lowering, static semantics, or end-to-end trust.
- Reclassified seven rule entries from gap-only to evidence-bearing without
  claiming closure: 26 of 69 K0/MEM rules now have executable evidence and 43
  still carry explicit evidence gaps.
- A Python 3.9 CI run exposed generated parser bytecode entering `spec.lock`.
  Disabled bytecode writes in the resolver and excluded `__pycache__`/`.pyc`
  artifacts from the lock input boundary; source artifacts remain locked.
- Rejected inline ASR spans because trivia would contaminate semantic identity.
  Implemented LCP-0003 as an orthogonal companion source-map experiment instead.
- Independent parsers agreed on every syntax provenance map, including source
  following a multibyte UTF-8 comment. Twelve resolved packages passed exact
  source inventory, pointer coverage, byte-boundary, origin, ownership, and
  ancestor-containment audits; all 7 schema-valid map mutations rejected.
- Preserved the next blocker explicitly: field projection identity still
  requires a static elaboration pass and was not guessed by name resolution.
- Locked replay-compatible Lean 4.24.0 at upstream commit `797c613...`, built
  the allocation-cell model, and replayed 44,846 declarations with pinned
  `lean4checker` and Nanoda chains. Four results remain `PROVED_FRAGMENT`; no
  full K0 theorem was promoted.

## Reuse path

- If G0 passes, create or promote durable compiler implementation work under
  `workspace/code/`; keep this repository as the normative specification source.
- Extract generally reusable specification-validation patterns into
  `workspace/share/` only after they stabilize.
