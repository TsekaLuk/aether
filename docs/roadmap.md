# G0 Closure Roadmap

Work is ordered by semantic dependency, not implementation convenience.

## 1. G0-02: complete K0 Core semantics

- Finish Core syntax for values, places, expressions, statements, calls, and
  control results.
- Define deterministic surface-to-Core lowering.
- Complete static judgments and small-step transitions.
- Done: independent Node/Python source parsers agree on the current grammar.
- Next: complete package name resolution, canonical ASR, and deterministic
  surface-to-Core lowering.

## 2. G0-03: complete object/resource states

- Formalize named-field partial initialization and control-flow joins.
- Define array/slice conservative overlap.
- Normalize borrow liveness over the CFG.
- Complete target faults, frame lifetime, and numeric B0 state.

## 3. G0-04: complete Rule ID coverage

- Done: all 69 K0/MEM rules are indexed; 50 explicit evidence gaps remain.
- Bind each applicable rule to accept, reject, observe, and boundary evidence.
- Add metamorphic and generated-property corpora.
- Promote nothing to `STABLE` until semantic OPEN items are zero.

## 4. G0-06: mechanize metatheory

- Done: Lean 4.32.2 is locked through LDR-0005 with leanchecker/nanoda replay.
- Done: a resource-transition fragment proves local determinism and explicit
  alloc/dealloc state changes without placeholders.
- Encode the Core syntax and transition relation.
- Prove determinism, preservation, progress, initialization safety, move safety,
  borrow safety, deallocation safety, explicit allocation, and explicit failure.
- Add an independent offline proof-check path.

## 5. G0-08: prove layer isolation

- Done for the current structural boundary: reserved tokens and ASR/Core schema
  smuggling probes reject.
- Prove later-layer nodes are unreachable from a K0 source/package manifest.
- Add mutation tests that attempt to smuggle effects, capabilities, concurrency,
  user `unsafe`, and FFI into K0 artifacts.

Only after all five workstreams pass may durable compiler work begin.
