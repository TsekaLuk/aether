# LCP-0002: Deterministic K0 Name Resolution

## 1. Identity

- LCP: `LCP-0002`
- Title: Deterministic K0 name resolution
- Author: Codex
- Accountable owner: unassigned; TsekaLuk review requested
- Date: 2026-08-10
- Status: `PROPOSED`
- Target layer: K0

This is an experimental specification increment under G0. It does not accept
LCP-0001, authorize a compiler, or promote any rule to `STABLE`.

## 2. Problem

The K0 module draft gives a symbol hash formula but does not completely define
declaration collection, active scope shadowing, enum-variant versus module-path
ambiguity, diagnostic precedence, local/lifetime identity, or canonical ASR
serialization. Independent implementations can therefore accept the same source
while binding a path to different declarations. Type checking and lowering on
top of such input would be nondeterministic even if each later pass were sound.

## 3. First-principles basis

P6 requires long-lived semantic identity and P8 requires machine-operable stable
structure. The emergence rule favors one total resolution function over context
specific lookup heuristics. A resolved path must be data, not a compiler guess.

## 4. Scope and non-goals

In scope: package/module validation, declaration collection, namespaces,
visibility, lexical local scopes, enum constructors, target allocator brands,
host primitive names, contract bindings, lifetime relation IDs, stable
diagnostics, and canonical resolved ASR.

Not in scope: type inference, overload resolution, method lookup, traits,
generics, dependencies, imports, field typing, borrow liveness, Core lowering,
or runtime behavior.

## 5. Package input

Resolution consumes exactly one validated K0 package manifest, one locked target
manifest, and the source bytes named by the manifest. Module-map keys are sorted
by ASCII byte order before processing. Each source module declaration must equal
its manifest key. Missing, extra, duplicate-normalized, or mismatched sources are
rejected before declaration collection.

After declaration collection, the manifest `entry` path must resolve to exactly
one package function. Its symbol identity is serialized at the ASR root. An
absent entry uses the ordinary not-found diagnostic; a type, constant, or enum
constructor entry uses the ordinary wrong-kind diagnostic. No separate entry
namespace or fallback spelling is introduced.

## 6. Declaration collection

Resolution has two passes. Pass 1 collects all module-level declarations and
enum variants; pass 2 resolves signatures, contracts, constants, and bodies.
Forward references and direct recursion are therefore independent of source
order. Source order never chooses between declarations.

## 7. Namespaces

K0 has disjoint `type`, `value`, `contract`, `lifetime`, `brand`, and `local`
namespaces. Structs and enums declare type names. Constants and functions declare
value names. Enum variants are constructor values owned by one enum. Contract IDs
are package-wide audit identities. Lifetime labels exist only inside one function
signature. Target brands and host primitives cannot be declared by source.

Two declarations with the same canonical key in one namespace are rejected.
There is no overload set and no arity- or type-directed tie breaking.

## 8. Path candidates

An unqualified value path searches the active local scopes, then the current
module's value declarations, then the locked host primitive set. An unqualified
type path searches only the current module's type declarations.

A qualified path is evaluated as a finite candidate set:

1. `module::name` for a package module and module-level declaration;
2. `Type::Variant` for a current-module enum constructor;
3. `module::Type::Variant` for a package enum constructor.

Exactly one visible candidate of the requested namespace and kind must remain.
Zero candidates reject; multiple candidates reject. Path length or source order
never silently selects one interpretation.

## 9. Visibility

A declaration is visible inside its defining module. Cross-module resolution
requires `public`. Encountering one unique but private candidate is
`RESOLVE-INACCESSIBLE`, not `RESOLVE-NOT-FOUND`. Field visibility is checked
later after the base type is known and is not guessed by name resolution.

## 10. Local scopes

Parameters enter the function scope before contracts and the body. A `let`
initializer resolves before its binding enters the current block. Match-pattern
bindings enter only the corresponding arm expression. Active binding shadowing
is rejected; a spelling may be reused only after the previous binding's lexical
scope has ended. Pattern bindings must be unique within the complete pattern.
`result` and target host primitive spellings cannot be declared as module values
or local bindings.

## 11. Stable identities

Module symbols keep the existing domain-separated identity formula. Local
bindings use the function symbol, binder kind, canonical preorder ordinal, and
spelling. Lifetime relations use the function symbol and label spelling. The ASR
stores both the short hash and the full identity tuple; a short-hash collision is
rejected and cannot select a declaration.

## 12. Lifetime relations

Lifetime labels are accepted only in function signatures. Equal spelling in one
signature denotes one relation ID. Every labelled returned-reference occurrence
in a public function must map to exactly one labelled input-reference occurrence.
No body inference may repair a missing or ambiguous public origin.

## 13. Contracts

Type invariants resolve declared fields and visible module constants. Function
contracts resolve parameters and visible module constants; `result` exists only
in `ensures`. Contract IDs are unique package-wide. Field projections remain
ordered name components until static typing resolves their nominal fields.

## 14. Target-controlled names

An allocator brand path `a::b` denotes the exact target brand `brand:a.b` and
must occur in the locked target manifest. Host primitive spellings come only
from the target allowlist and resolve to `primitive:<name>`. Source declarations
cannot replace, alias, or manufacture either identity.

## 15. Diagnostic order

The resolver reports one diagnostic. It first checks manifest/source closure,
then collects every declaration and rejects duplicates or identity collisions,
then validates the entry. Remaining items are resolved by sorted module path and
source order; within an item, signatures precede contracts and bodies, and child
nodes use left-to-right source preorder. Recovery nodes never enter an accepted
ASR. No implementation may reorder errors using parallel completion time.

## 16. Canonical ASR

Accepted output uses the closed `aether.asr/k0-0.4` schema. Object keys serialize
in lexicographic order, modules in module-path order, and all semantically ordered
child arrays in source order. Every name-bearing reference is replaced by a
symbol, local, lifetime, brand, or primitive identity. Unresolved spelling may
remain only as audit metadata and field components awaiting static typing. The
root `entry` is the identity of the already resolved function and must belong to
the same ASR symbol closure.

## 17. Lowering boundary

Core lowering accepts only schema-valid resolved ASR. It must not repeat lookup,
consult source text, infer visibility, or choose between candidate paths. This
proposal deliberately does not define the Core node mapping; G0-02 remains
failed until a separate lowering contract is complete.

## 18. Test plan

Differential Node/Python probes cover entry resolution, forward references,
recursion, qualified modules, variants, brands, primitives, lifetimes, locals,
pattern scopes, and contracts. Negative cases cover every diagnostic class.
Equivalent cases permute manifest object order and trivia. Schema-smuggling tests
reject unresolved and later-layer nodes.

## 19. Compatibility

This is a breaking draft ASR and diagnostic change. No stable source, ABI, or
artifact contract exists. Existing parse trees remain parser evidence but are not
resolved ASR and cannot be consumed as Core input.

## 20. Migration and rollback

Draft tools must consume resolved identities instead of path arrays. Active
shadowing must be renamed. Ambiguous module/variant paths must be made unique by
renaming a declaration or module. Rollback removes the resolver artifacts and
restores the prior incomplete ASR schema; no stable artifact can depend on them.

## 21. Safety and trust impact

Deterministic binding prevents a verifier and compiler from proving or executing
different declarations. The probes are not trusted language implementations.
The ASR schema, resolver rules, corpora, and independent agreement enter the spec
lock; the encoding relation to future Core remains an explicit gap.

## 22. Alternatives

Import search paths, overload ranking, implicit preludes, and type-directed
lookup were rejected because each adds hidden inputs or search. Globally banning
all repeated spelling was rejected because disjoint lexical scopes can be
resolved without ambiguity. Leaving field resolution here was rejected because
it requires the base expression's static type.

## 23. Success and stop conditions

Success requires both independent probes to return byte-for-structure identical
ASR or diagnostics for the frozen corpus, schema validation of every accepted
artifact, stable hashes across input-map permutations, and rejection of every
unresolved/later-layer smuggling probe. Stop if resolution needs backtracking,
type inference, filesystem search outside the manifest, or source-order tie
breaking.
