# Experiment Log

## 2026-08-10

- Imported Aether PRD v0.1-v0.3 and the v0.4 executable K0 specification.
- Confirmed 380 parent PRD Rule IDs are machine-recognizable.
- Indexed 21 of 69 current K0/MEM rules in the executable subset.
- Ran 14 conformance vectors through independent Node and Python state machines;
  all 14 results agreed with each other and the hand-authored semantic oracle.
- Verified `spec.lock` is reproducible across repeated local runs.
- Kept G0 at `FAIL`; tests were not promoted to formal proofs.
- Identified five blocking workstreams: complete Core semantics, complete resource
  states, rule coverage, mechanized metatheory, and K0 layer-isolation proof.

## Reuse path

- If G0 passes, create or promote durable compiler implementation work under
  `workspace/code/`; keep this repository as the normative specification source.
- Extract generally reusable specification-validation patterns into
  `workspace/share/` only after they stabilize.
