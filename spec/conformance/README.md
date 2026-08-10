# K0 Conformance Corpus

Status: `DRAFT`

Each JSON vector is an oracle derived from the static and dynamic semantics, not
from an executor's historical output. Vectors contain an initial state, an ordered
list of primitive Core transitions, applicable Rule IDs, and the expected status.

The two executors share only this serialized input and the documented result
shape. They do not share source code or runtime libraries.

## Result shape

```json
{
  "id": "accept.move_once",
  "status": "ok",
  "events": [],
  "final": {
    "places": {},
    "allocators": {},
    "heap": {},
    "borrows": {}
  }
}
```

Rejected results add `code` and zero-based `step`. Execution stops before the
rejected transition mutates state.

## Transition-vector limitation

This corpus checks the resource state machine. It is not a substitute for source
parsing, name resolution, control-flow lowering, or a complete Core evaluator.
Those remain explicit G0 blockers.
