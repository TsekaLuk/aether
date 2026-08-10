# Changelog

## 0.4.0-draft - 2026-08-10

- Added the first executable K0 specification package.
- Added independent Node and Python semantic transition executors.
- Added 14 conformance vectors for move, borrow, allocation, deallocation, and
  affine leak behavior.
- Added content-addressed `spec.lock` generation and a machine-readable G0 report.
- Recorded G0 as `FAIL` with five explicit blocking workstreams.
- Proposed a draft K0 surface-grammar closure around explicit aggregate
  construction, dereference, public lifetime relations, and total contract
  expressions through LCP-0001/draft LDR-0004.
- Added independent Node and Python parsers with 77 agreeing source cases and two
  agreeing invalid UTF-8 byte cases.
- Added 55 generated reserved-token mutations and 9 closed-schema smuggling
  probes plus 6 package-manifest probes for the K0 layer boundary.
- Proposed deterministic K0 package name resolution through LCP-0002/draft
  LDR-0006, including two-pass collection, explicit namespaces, entry validation,
  visibility, local/lifetime/contract identity, and target-controlled names.
- Added independent Node and Python resolvers with 38 agreeing resolution inputs;
  11 accepted outputs pass the closed resolved-ASR schema and identity-closure
  audit, while 6 structurally valid semantic-tampering mutations reject.
- Indexed all 69 K0/MEM rules; 26 now carry executable evidence and 43 preserve
  explicit evidence gaps.
- Selected replay-compatible Lean 4.24.0 through LDR-0005 and checked four
  allocation-cell theorem fragments without proof placeholders; pinned the
  independent checker sources and Rust build toolchain.
