# K0 Metatheory Ledger

Status: `DRAFT`

Tests and dual executors are evidence about implementations. They are not proofs.
The following theorem statements are required before G0 can pass.

| ID | Statement | Status | Required artifact |
|---|---|---|---|
| META-K0-DET | A well-formed nonterminal Core state has at most one next transition for a fixed target | STATEMENT_ONLY | mechanized proof |
| META-K0-PRES | A well-typed transition preserves state well-formedness and result typing | STATEMENT_ONLY | mechanized proof |
| META-K0-PROGRESS | A well-typed nonterminal state steps, returns, explicitly fails, or reaches a declared target fault | STATEMENT_ONLY | mechanized proof |
| META-K0-MOVE | No accepted trace reads or moves an uninitialized place | TESTED_SUBSET | proof over static and dynamic relation |
| META-K0-BORROW | No accepted trace performs an access forbidden by a live borrow | TESTED_SUBSET | proof over overlap and liveness |
| META-K0-DEALLOC | No accepted trace deallocates an allocation twice, with the wrong brand, or while borrowed | TESTED_SUBSET | proof over brand and allocation invariants |
| META-K0-EXPLICIT-ALLOC | Every dynamic AllocationId in a trace is introduced by an alloc event | TESTED_SUBSET | inductive proof |
| META-K0-EXPLICIT-FAIL | Every recoverable runtime failure is represented by a sum value | STATEMENT_ONLY | proof over all Core operations |

No theorem in this ledger is marked `PROVED`. A future proof tool and its version
must be entered into `spec.lock`; prose review cannot change these statuses.
