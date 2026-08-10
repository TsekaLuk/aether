# LCP-0003: Orthogonal K0 Source Provenance

## 1. Identity

- LCP: `LCP-0003`
- Title: Orthogonal K0 source provenance
- Author: Codex
- Accountable owner: unassigned; TsekaLuk review requested
- Date: 2026-08-10
- Status: `PROPOSED`
- Target layer: K0

This is an experimental specification increment under G0. It does not accept
LCP-0001 or LCP-0002, authorize a compiler, or promote any rule to `STABLE`.

## 2. Problem

Resolved ASR identifies declarations and references but cannot locate accepted
nodes in the exact source bytes that produced them. Putting byte spans directly
inside semantic ASR would solve diagnostics while breaking a stronger invariant:
trivia-only edits would change ASR and any hash computed over it. Conversely, a
single file hash cannot locate a diagnostic or distinguish source provenance
from semantic identity.

## 3. First-principles basis

P6 requires durable audit identity, P8 requires machine-operable artifacts, and
PIPE-006 requires released artifacts to map back to source nodes. PIPE-009 and
PIPE-010 require separate fingerprints for source and semantics. The emergence
rule therefore favors two orthogonal artifacts: trivia-independent resolved ASR
and an exact companion source map.

## 4. Scope and non-goals

In scope: raw UTF-8 byte coordinates, exact source inventory, source hashes,
synthetic-node provenance, ASR JSON Pointers, canonical source-map ordering,
schema closure, and validation independent of parser implementation.

Not in scope: field identity, type checking, control-flow lowering, macro origin,
generated files, dependencies, proof-term locations, editor protocols, line and
column numbering, or runtime debug information.

## 5. Artifact pair

An accepted package-resolution result contains:

1. one `aether.asr/k0-0.4` semantic artifact; and
2. one `aether.source-map/k0-0.4` provenance artifact.

The source map names the ASR schema, package ID, and domain-separated canonical
semantic ASR hash. The hash binds the companion to one exact ASR without putting
provenance inside that ASR. The map does not change any ASR identity and is never
an input to type checking, lowering, contract normalization, or execution.

## 6. Raw-byte coordinate system

Every range is a zero-based half-open interval `[start,end)` over the original,
validated UTF-8 bytes supplied by the package input. Both endpoints must be UTF-8
scalar boundaries. No BOM removal, newline rewriting, Unicode normalization, or
comment deletion occurs before coordinates are assigned.

Lexical semantics may classify CR, LF, and CRLF as trivia without giving those
spellings Core meaning. The provenance coordinate remains in the original byte
stream. Non-ASCII scalars are allowed in comments; outside comments they remain
invalid K0 tokens until a later layer defines a literal form.

## 7. Source inventory

`sources` is the exact manifest-closed source set in ASCII path order. Each entry
contains the normalized relative path, `sha256:` digest of the unmodified bytes,
and byte length. Missing, extra, duplicate, reordered, rehashed, or resized
entries reject the source map.

## 8. ASR pointers

Every map entry names one ASR object using a canonical JSON Pointer. Pointer
components use `~0` for `~` and `~1` for `/`. Arrays use canonical decimal
indices. A pointer must resolve to an object in the paired ASR; dangling,
duplicate, noncanonical, scalar, or array pointers reject.

## 9. Coverage boundary

The map covers every source-derived ASR object in deterministic ASR preorder:
object keys use ASCII order and array elements use semantic order. This includes
modules, items, parameters, fields, variants, payloads, types, contracts,
blocks, statements, expressions, match arms, patterns, and compound field
entries.

Generated identity tuples, local/lifetime/contract identity records, and the
derived target object inside a contract reference are excluded. Their nearest
source-derived owner already has provenance and their identities are audited by
the ASR identity closure.

## 10. Source and synthetic origins

An entry has origin `source` or `synthetic`. A source-origin range must be
nonempty. A synthetic range must be empty and identifies the insertion point in
the enclosing syntax. K0 currently synthesizes only an omitted function result
as `unit`; its insertion point is immediately after the closing parameter list.

No implementation may silently label generated syntax as source-originated.

## 11. Containment

Every entry belongs to the source named by its enclosing ASR module. Its range
must be contained by the nearest ancestor that has a mapped range. A child cannot
escape its module, switch source files, or extend beyond the source byte length.

## 12. Parser evidence map

Independent parser probes may emit an internal syntax-tree source map to carry
locations into resolution. It is evidence, not a published language artifact.
It must cover every syntax object, use the same byte/origin rules, and preserve
the trivia-independent canonical tree as a separate value.

## 13. Semantic hashing

ASR hashes, symbol identities, contract expression hashes, and future Core hashes
exclude source-map content. `asr_hash` is the SHA-256 digest of the domain
`aether-k0-resolved-asr`, one NUL byte, and canonical semantic ASR JSON. A
trivia-only edit may change source hashes, ranges, and the source-map artifact
hash; it must not change `asr_hash` or future `core_hash`. Manifest object-order
changes that do not change bytes alter neither artifact.

## 14. Diagnostic use

Diagnostics may select the smallest mapped object that owns the failing semantic
obligation. Tools may derive line/column displays from the raw bytes, but those
derived coordinates are not normative and cannot replace byte ranges in audit
artifacts.

## 15. Determinism and failure order

For fixed source bytes, manifest, target, and `spec.lock`, source-map generation
is a total deterministic function after parsing and resolution succeed. Source
map validation occurs after ASR schema and identity validation. It cannot repair
or alter an invalid ASR.

## 16. Security and privacy

The map contains paths, hashes, and ranges, not source text. It neither redacts
nor authorizes publication of the underlying sources. Artifact policy must treat
paths as potentially sensitive metadata. No absolute path, environment value,
timestamp, hostname, or tool-specific object address may enter the map.

## 17. Schema and audit

`asr/K0.source-map.schema.json` closes the serialized shape. The independent
validator additionally recomputes the paired ASR hash, source hashes and lengths,
UTF-8 boundaries, pointer closure, exact object coverage, ordering, module
ownership, range origin, and ancestor containment. Schema validity alone is
insufficient.

## 18. Test plan

Node and Python probes must agree on syntax and resolved source maps. Accepted
cases include non-ASCII comment bytes and synthetic results. Metamorphic cases
show that trivia changes provenance but not ASR, while manifest-map reordering
changes neither. Structurally valid mutations target hashes, pointers, bounds,
source ownership, coverage, and origin rules.

## 19. Compatibility

This is a breaking draft tool-output addition, not a source-language or runtime
semantic change. Resolver consumers that deserialize the complete result must
accept the companion artifact. The ASR schema and semantic identities are
unchanged. Source-map and `spec.lock` hashes change.

## 20. Migration and rollback

Draft consumers must store ASR and source map as distinct artifacts and must not
fold provenance into semantic hashing. Rollback removes the companion map and
restores missing diagnostic provenance; no stable artifact currently depends on
it.

## 21. Safety and trust impact

The map makes AI-generated changes auditable down to original bytes without
letting formatting perturb semantic identity. Independent agreement is
executable evidence, not a proof that all future lowering diagnostics select the
right node. Field elaboration and lowering remain explicit blockers.

## 22. Alternatives

Inline spans were rejected because they contaminate semantic ASR hashes. Line and
column coordinates were rejected because newline and display-width policies are
unstable. Token indices were rejected because lexer versions can renumber them.
One file hash was rejected because it cannot locate nodes. Absolute paths were
rejected because they leak host state and destroy reproducibility.

## 23. Success and stop conditions

Success requires exact independent agreement, closed-schema validation, exact
coverage and hash audits for every accepted resolved package, semantic ASR
equality across trivia changes, provenance inequality when bytes differ, and
rejection of every frozen mutation. Stop if provenance affects name resolution,
semantic hashes, or Core behavior. G0-02 and G0-08 remain failed until field
elaboration and source-to-Core reachability are closed.
