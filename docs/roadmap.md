# G0 Closure Roadmap

Work is ordered by semantic dependency, not implementation convenience.

## 1. G0-02: complete K0 Core semantics

- Finish Core syntax for values, places, expressions, statements, calls, and
  control results.
- Define deterministic surface-to-Core lowering.
- Complete static judgments and small-step transitions.
- Done: independent Node/Python source parsers agree on the current grammar.
- Done: independent Node/Python package resolvers agree on deterministic name,
  scope, visibility, lifetime, contract, target-brand, and entry resolution.
- Done: accepted resolver output passes a closed ASR schema and recomputed
  identity/reference-closure audit.
- Done: a companion source map binds every source-derived ASR object to exact
  original UTF-8 bytes without contaminating semantic ASR hashes.
- Next: add statically resolved field identities, then define deterministic
  resolved-ASR-to-Core lowering with provenance propagation.

## 2. G0-03: complete object/resource states

- Formalize named-field partial initialization and control-flow joins.
- Define array/slice conservative overlap.
- Normalize borrow liveness over the CFG.
- Complete target faults, frame lifetime, and numeric B0 state.

## 3. G0-04: complete Rule ID coverage

- Done: all 69 K0/MEM rules are indexed; 43 explicit evidence gaps remain.
- Bind each applicable rule to accept, reject, observe, and boundary evidence.
- Add metamorphic and generated-property corpora.
- Promote nothing to `STABLE` until semantic OPEN items are zero.

## 4. G0-06: mechanize metatheory

- Done: replay-compatible Lean 4.24.0 is locked through LDR-0005 with pinned
  lean4checker/nanoda replay.
- Done: a resource-transition fragment proves local determinism and explicit
  alloc/dealloc state changes without placeholders.
- Encode the Core syntax and transition relation.
- Prove determinism, preservation, progress, initialization safety, move safety,
  borrow safety, deallocation safety, explicit allocation, and explicit failure.
- Add an independent offline proof-check path.

## 5. G0-08: prove layer isolation

- Done for the current structural boundary: reserved tokens and ASR/Core schema
  smuggling probes reject.
- Done for the current resolved-ASR identity boundary: entry, symbol, local,
  lifetime, contract, target-brand, and host-primitive tampering rejects.
- Done for the current source-provenance boundary: hashes, pointers, ranges,
  origin, coverage, module ownership, and UTF-8 boundaries audit independently.
- Prove later-layer nodes are unreachable from a K0 source/package manifest.
- Add mutation tests that attempt to smuggle effects, capabilities, concurrency,
  user `unsafe`, and FFI into K0 artifacts.

Only after all five workstreams pass may durable compiler work begin.
