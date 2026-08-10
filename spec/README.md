# Specification Package

This directory implements the logical package contract from Aether PRD v0.3.
All normative and executable artifacts are `DRAFT` unless their file and rule
index explicitly state otherwise.

Key entry points:

- `constitution/K0.md`: invariant boundary.
- `grammar/K0.ebnf`: draft K0 surface grammar.
- `core/`: static, dynamic, memory, numeric, error, and transition schemas.
- `rules/K0.json`: complete K0/MEM traceability index, including explicit gaps.
- `conformance/`: semantic, source, layer, and metamorphic oracles.
- `decisions/`: provisional LDRs.
- `proof/`: theorem ledger, trusted-base statement, and Lean fragments.
- `manifests/spec.lock.json`: generated content lock.

The parser and executor probes in `../tools/` validate documented subsets. They
are not normative, are not a production frontend/runtime, and cannot promote a
rule without the corresponding normative semantics and proof obligations.
