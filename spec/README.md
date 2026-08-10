# Specification Package

This directory implements the logical package contract from Aether PRD v0.3.
All normative and executable artifacts are `DRAFT` unless their file and rule
index explicitly state otherwise.

Key entry points:

- `constitution/K0.md`: invariant boundary.
- `grammar/K0.ebnf`: draft K0 surface grammar.
- `core/`: static, dynamic, memory, numeric, error, and transition schemas.
- `rules/K0.json`: executable Rule ID index.
- `conformance/`: hand-authored semantic oracles.
- `decisions/`: provisional LDRs.
- `manifests/spec.lock.json`: generated content lock.

The reference executors in `../tools/` validate only the documented transition
subset. They are not normative and are not a production runtime.
