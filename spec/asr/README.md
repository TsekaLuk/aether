# K0 ASR Status

`K0.schema.json` closes the package envelope, resolved entry function, full
symbol identity tuples, local and lifetime identities, resolved type encodings,
contracts, expressions, statements, patterns, declarations, and canonical child
ordering. Unknown object fields are rejected at every node; the validator audits
entry and reference closure in addition to recomputing every identity hash.
`K0.source-map.schema.json` defines a separate exact-byte provenance artifact;
its content is deliberately excluded from semantic ASR and contract hashes.

The artifacts remain `DRAFT`: statically resolved field IDs are not yet
represented, and LCP-0002/LDR-0006 plus LCP-0003/LDR-0007 have not received
independent review. They are executable evidence for G0, not stable tool APIs.
