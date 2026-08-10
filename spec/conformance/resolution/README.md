# K0 Resolution Conformance

`K0.json` drives two independent package resolvers from manifest-closed source
bytes to resolved ASR. Accepted outputs must agree byte-for-structure and satisfy
`asr/K0.schema.json`; rejected outputs must agree on phase, code, module, and
subject. Equivalent inputs must produce the same resolved ASR.

The corpus is experimental evidence for LCP-0002. It does not make the proposal
accepted or complete Core lowering.
