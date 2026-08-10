# K0 Metatheory Ledger

Status: `DRAFT`

Tests and dual executors are evidence about implementations. They are not proofs.
The following theorem statements are required before G0 can pass.

| ID | Statement | Status | Required artifact |
|---|---|---|---|
| META-K0-DET | A well-formed nonterminal Core state has at most one next transition for a fixed target | PROVED_FRAGMENT | allocation-cell command fragment in `mechanized/AetherProofs.lean`; full Core pending |
| META-K0-PRES | A well-typed transition preserves state well-formedness and result typing | STATEMENT_ONLY | mechanized proof |
| META-K0-PROGRESS | A well-typed nonterminal state steps, returns, explicitly fails, or reaches a declared target fault | PROVED_FRAGMENT | ready allocation-cell commands step or halt; full Core pending |
| META-K0-INIT | No accepted trace reads, borrows, moves, or deallocates an uninitialized place | STATEMENT_ONLY | proof over place and partial-initialization state |
| META-K0-MOVE | No accepted trace reads or moves an uninitialized place | TESTED_SUBSET | proof over static and dynamic relation |
| META-K0-BORROW | No accepted trace performs an access forbidden by a live borrow | TESTED_SUBSET | proof over overlap and liveness |
| META-K0-DEALLOC | No accepted trace deallocates an allocation twice, with the wrong brand, or while borrowed | PROVED_FRAGMENT | live-to-dead cell transition is proved; brand, borrow, and trace induction pending |
| META-K0-EXPLICIT-ALLOC | Every dynamic AllocationId in a trace is introduced by an alloc event | PROVED_FRAGMENT | every resource-fragment step has an explicit alloc/dealloc event; fresh-ID trace theorem pending |
| META-K0-EXPLICIT-FAIL | Every recoverable runtime failure is represented by a sum value | STATEMENT_ONLY | proof over all Core operations |

`K0-theorems.json` is the machine authority for theorem identities and statuses;
this table is the explanatory mirror. No theorem in this ledger is marked
`PROVED`. Lean 4 and its independent replay
paths are locked in `proof/TCB.md` and the toolchain manifest. A fragment status
means a checked theorem exists for a strict submodel; it cannot satisfy G0-06 or
be cited as the full-language theorem.
