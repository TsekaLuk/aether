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
- Rejected 55 generated reserved-token placements and 8 structured ASR/Core
  smuggling probes, plus 6 forbidden package manifests; kept G0-08 failed because
  resolved-ASR reachability is not yet proved.
- Locked Lean 4.32.2 at upstream commit `f3b06c7...`, built the allocation-cell
  model, and replayed it with `leanchecker`. Four results remain
  `PROVED_FRAGMENT`; no full K0 theorem was promoted.

## Reuse path

- If G0 passes, create or promote durable compiler implementation work under
  `workspace/code/`; keep this repository as the normative specification source.
- Extract generally reusable specification-validation patterns into
  `workspace/share/` only after they stabilize.
