# K0 Resolution Conformance

`K0.json` drives two independent package resolvers from manifest-closed source
bytes to resolved ASR. Accepted outputs must agree byte-for-structure and satisfy
`asr/K0.schema.json`; rejected outputs must agree on phase, code, module, and
subject. Equivalent inputs must produce the same resolved ASR.

Accepted outputs also carry `aether.source-map/k0-0.4`. The validator checks its
closed schema, exact source hashes, UTF-8 boundaries, JSON Pointer closure,
complete ASR-object coverage, origins, ordering, and containment. Trivia may
change this companion artifact but cannot change semantic ASR.

The corpus is experimental evidence for LCP-0002 and LCP-0003. It does not make
either proposal accepted or complete field elaboration/Core lowering.
