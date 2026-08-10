# K0 ASR Status

`K0.schema.json` closes the package envelope, resolved entry function, full
symbol identity tuples, local and lifetime identities, resolved type encodings,
contracts, expressions, statements, patterns, declarations, and canonical child
ordering. Unknown object fields are rejected at every node; the validator audits
entry and reference closure in addition to recomputing every identity hash.

The schema remains `DRAFT`: source byte spans and statically resolved field IDs
are not yet represented, and LCP-0002/LDR-0006 have not received independent
review. It is executable evidence for G0, not a stable tool API.
