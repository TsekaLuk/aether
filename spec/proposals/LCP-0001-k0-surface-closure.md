# LCP-0001: Close the K0 Surface Grammar

## 1. Identity

- LCP: `LCP-0001`
- Title: Close the K0 surface grammar
- Author: Codex
- Accountable owner: unassigned; TsekaLuk review requested
- Date: 2026-08-10
- Status: `PROPOSED`
- Target layer: K0

This proposal is implemented only as a disposable specification experiment under
G0. It is not accepted and does not promote any rule or artifact to `STABLE`.
LCP-008 review and a named-owner decision remain mandatory.

## 2. Problem

The v0.4 draft grammar cannot express four behaviors already required by the K0
constitution: a public returned-reference lifetime relation (`K0-BORROW-005`),
construction of declared aggregate values, access through a reference, and type
invariants (`K0-CONTRACT-001`). It also leaves record construction ambiguous with
a block following an `if` condition. A parser written against the draft must
invent behavior, so G0-02 and G0-08 cannot be satisfied.

## 3. First-principles basis

This change follows P6 (long-lived semantic identity), P8 (AI-operable stable
structure), and the emergence rule: one closed grammar and one explicit lowering
remove implementation choices instead of adding independent mechanisms. Without
the change, parser implementations necessarily drift before type checking.

## 4. Scope and non-goals

In scope:

- lexical lifetime labels;
- explicit value construction with `init`;
- explicit dereference with `*`;
- type invariant clauses;
- a total, side-effect-free contract expression grammar;
- deterministic grammar treatment of `if` as an expression.

Not in scope: lifetime inference algorithms, user generics, implicit allocation,
destructors, effects, capabilities, concurrency, `unsafe`, FFI, proof terms,
contract proving, or new runtime observables.

## 5. Surface specification

Public reference relations use labels directly in reference types:

```aether
fn first(x: &'source Pair) -> &'source u64 {
    &x.first
}
```

The label is a relation name, not a generic type parameter and not a runtime
value. A public signature containing a returned reference must label that return
and at least one input reference with the same label.

Aggregate values use `init`, which constructs a value in the current evaluation
context and never allocates:

```aether
let p = init Pair { first: 1, second: 2 };
```

References are accessed explicitly:

```aether
let n: u64 = *r;
```

Type invariants are declared inside a nominal type body and remain
`DECLARED_UNPROVEN` in K0.

## 6. Reference-level increment

The normative increments are the `LIFETIME` token and the productions
`invariant_clause`, `record_expression`, `contract_expression`, and the `*`
unary/place form in `grammar/K0.ebnf`. `init` becomes a K0 keyword. The lexical
and name-resolution specifications define label identity and the constructor
namespace.

## 7. Core lowering

- `init P { f: e, ... }` lowers left to right to `construct P [f = C(e), ...]`.
- `*e` in value position lowers to `read_deref C(e)`; in place position it lowers
  to `deref_place C(e)`.
- `&'a T` erases the spelling of `a` after resolution but retains the resolved
  lifetime relation ID in ASR and Core function signatures.
- `if` lowers to one conditional branch with an explicit join; missing `else`
  lowers to an `else` branch returning `unit`.
- invariant and contract expressions lower to a separate pure specification IR
  and never to runtime Core operations in K0.

No lowering creates an allocation, invokes user code implicitly, or introduces
a K1/K2 Core node.

## 8. Static judgments

`init P` is accepted only when `P` resolves uniquely to a struct or record enum
variant, every declared field occurs exactly once, no unknown field occurs, and
all field expressions have their declared types. Fields evaluate in source order;
declaration order affects neither evaluation nor acceptance.

`*e` is accepted only when `e` has `&T` or `&mut T`. Reading through `&T` requires
shared permission. Assignment through `&mut T` requires its exclusive permission.

A public returned reference without a label, without an identically labelled
input origin, or with more than one possible origin is rejected. Private local
reference lifetimes may be uniquely inferred by the K0 borrow algorithm.

Contract expressions admit only constants, visible parameters, `result` in an
`ensures`, field projection, total boolean operators, comparisons, and exact
integer `+`, `-`, `*` subject to B0 range proof. Calls, indexing, allocation,
division, remainder, move, borrow, dereference, assignment, and loops are absent
from the grammar and therefore rejected before purity analysis.

## 9. Dynamic rules

`construct` evaluates each field expression left to right, then produces one
initialized aggregate value. It has no event. `read_deref` performs the same
copy-or-move operation as a direct place read after resolving the referenced
place and checking its live permission. Lifetime labels and specification IR
have no runtime transition.

## 10. Resource interaction

Construction transfers each non-`Copy` field value exactly once. Failure to
finish a construction cannot be a recoverable runtime event in accepted K0; B0
must establish all operations before execution. Dereference does not create a
new permission. `init` does not call `alloc` and cannot create `Own<T,A>` except
by moving an already existing owner into a declared field.

## 11. Proof impact

Preservation must cover aggregate construction and dereferenced reads/writes.
Borrow safety must relate a resolved lifetime ID and reference provenance to the
permission graph. Determinism must cover field evaluation order and `if` joins.
The contract IR is excluded from runtime progress but included in parsing,
well-formedness, canonicalization, and hashing proofs.

## 12. Interaction matrix

| Stable direction | Interaction | Required evidence |
|---|---|---|
| Copy/move | field expressions copy or move by field type | partial-move vectors |
| Borrow | dereference uses existing permission | conflict and last-use vectors |
| Allocation | `init` creates no allocation | no-alloc observable vector |
| Explicit failure | construction has no hidden recovery | lowering inspection |
| Contracts | invariant enters pure specification IR | reject impure forms |
| Target model | lifetime labels and `init` are target independent | cross-target hash test |
| K1/K2 boundary | later tokens/nodes remain unreachable | layer mutation corpus |

## 13. Safety analysis

The primary safety risk is treating `init` as allocator-backed construction or
allowing dereference to bypass permission checks. Both are forbidden by lowering
and must have negative transition evidence. Contract expressions deliberately
exclude potentially partial operations to prevent hidden runtime checks and
non-total specification evaluation.

## 14. AI operability

Every new syntax node has one canonical kind, ordered children, stable source
spans, and no parser recovery node in an accepted ASR. Diagnostics identify the
offending token and expected layer. An AI repair may add an explicit lifetime
label only when there is one input origin; it must not guess among origins.

## 15. Cost

The grammar gains one token class, one keyword, four principal productions, and
two Core operations. Parser cost is linear. Borrow checking already needs
lifetime relation IDs for `K0-BORROW-005`; this proposal exposes rather than
creates that cost. Runtime cost is zero beyond explicit aggregate operations.

## 16. Compatibility

This is a breaking source, ASR, Core, proof, and tooling change relative to the
unfrozen v0.4 draft. It has no ABI compatibility impact because K0 has no stable
ABI. No draft artifact is entitled to compatibility. The language version stays
`0.4.0-draft` until the complete G0 package is ready; the spec lock records the
change.

## 17. Migration and withdrawal

Draft record expressions, if any exist outside the repository, migrate to
`init P { ... }`. Reference-returning public functions add explicit labels.
Withdrawal restores the previous grammar and removes its parsers and tests; no
stable artifact can depend on either form.

## 18. Test plan

- accept: every new production and all pre-existing K0 productions;
- reject: missing/ambiguous public lifetime origins and impure contract forms;
- boundary: every reserved K1/K2 token in each syntactically reachable position;
- observe: aggregate construction emits no allocation event;
- metamorphic: trivia and line-ending changes preserve canonical syntax;
- differential: independent Node and Python parsers agree on canonical trees and
  stable diagnostics.

## 19. Alternatives

Library constructors cannot define parser or lifetime syntax. Inferring public
lifetimes would violate explicit ABI requirements. `Type { ... }` is shorter but
is ambiguous with a following block in condition position. Making all borrows
lexical avoids labels but contradicts the already accepted CFG-liveness model.
Doing nothing forces implementation-defined parsing.

## 20. Drawbacks

`init` is one more keyword and less familiar than record literal syntax.
Lifetime labels increase public signature size. A separate contract grammar
duplicates part of expression parsing. These costs are accepted because each
removes a semantic ambiguity or an unsafe inference boundary.

## 21. Precedents

Rust demonstrates explicit lifetime relations and place dereference, while C,
Go, and Zig demonstrate the value of visibly distinct construction forms. These
are engineering precedents only; the decision follows Aether's own invariants.

## 22. Open questions

No syntax-affecting question may remain before this LCP becomes `PROVISIONAL`.
Diagnostic wording and parser implementation structure are experimental details
provided codes, spans, and acceptance remain identical.

## 23. Success and stop conditions

Success requires two independent parsers to accept a corpus covering every K0
production, reject every reserved token with the same stable code, and emit
identical canonical trees and diagnostics. Stop and reconsider if the grammar
requires context-dependent tokenization, parser backtracking, implicit lifetime
origin choice, or any Core node outside K0.
