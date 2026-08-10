# Aether Lab Index

Purpose:

- Develop Aether as an AI-native trustworthy systems-language specification.
- Close the K0 G0 implementation gate before authorizing durable compiler work.

Inventory:

- `README.md`: repository overview and current authorization boundary.
- `docs/prd/`: PRD history; v0.3 is the current parent product contract.
- `spec/`: v0.4 K0 executable specification package.
- `tools/`: independent parsers/executors, schema checker, and validator.
- `reports/`: generated G0 evidence.
- `spec/proof/`: locked Lean TCB, theorem ledger, and mechanized fragments.
- `docs/roadmap.md`: ordered G0 closure plan.
- `CONTRIBUTING.md`: semantic-change and review protocol.
- `experiment-log.md`: tested hypotheses and findings.
- `.github/`: CI, ownership, and contribution templates.

Active Items:

- Close G0-02: complete K0 Core grammar and operational semantics.
- Close G0-03: complete object/resource state machines.
- Close G0-04: cover all K0/MEM Rule IDs.
- Close G0-06: mechanize metatheory.
- Close G0-08: prove K1/K2 unreachable from K0 stable input.

Completed G0 prerequisites:

- Dual source-parser agreement and lexical layer rejection corpus.
- Closed ASR/Core object schemas with structured smuggling probes.
- Full 69-rule traceability index with explicit gaps.
- Lean 4.32.2 selection and independently replayable proof fragment.

Links:

- GitHub: `https://github.com/TsekaLuk/aether`
- Current gate: `reports/G0.md`

Maintenance:

- Run `npm test` after every normative or executable change; run `lake build` and
  `lake env leanchecker AetherProofs` after proof changes.
- Update this index when meaningful files or project status change.
- Promote durable implementation code to `workspace/code/` only after G0 passes.
- Last reviewed: 2026-08-10.
