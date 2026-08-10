# G0 Closure Roadmap

Work is ordered by semantic dependency, not implementation convenience.

## 1. G0-02: complete K0 Core semantics

- Finish Core syntax for values, places, expressions, statements, calls, and
  control results.
- Define deterministic surface-to-Core lowering.
- Complete static judgments and small-step transitions.
- Add an independent source parser and ASR canonicalization check.

## 2. G0-03: complete object/resource states

- Formalize named-field partial initialization and control-flow joins.
- Define array/slice conservative overlap.
- Normalize borrow liveness over the CFG.
- Complete target faults, frame lifetime, and numeric B0 state.

## 3. G0-04: complete Rule ID coverage

- Index all 69 K0/MEM rules.
- Bind each applicable rule to accept, reject, observe, and boundary evidence.
- Add metamorphic and generated-property corpora.
- Promote nothing to `STABLE` until semantic OPEN items are zero.

## 4. G0-06: mechanize metatheory

- Select and lock a proof assistant through a trusted-base ADR.
- Encode the Core syntax and transition relation.
- Prove determinism, preservation, progress, move safety, borrow safety,
  deallocation safety, explicit allocation, and explicit failure.
- Add an independent offline proof-check path.

## 5. G0-08: prove layer isolation

- Reject every K1/K2 token and ASR/Core node at the K0 boundary.
- Prove later-layer nodes are unreachable from a K0 source/package manifest.
- Add mutation tests that attempt to smuggle effects, capabilities, concurrency,
  user `unsafe`, and FFI into K0 artifacts.

Only after all five workstreams pass may durable compiler work begin.
