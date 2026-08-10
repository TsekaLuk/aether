# K0 Source Conformance Corpus

This corpus exercises the lexical and syntactic K0 boundary. Accepted cases are
parsed independently by the Node and Python specification probes. The probes
must produce byte-identical canonical JSON after key sorting. Rejected cases
must agree on phase, stable code, token, and byte span.

The `equivalent` groups assert semantic syntax normalization: trivia, line
endings, digit separators, and integer radix do not affect the canonical tree.
This corpus does not establish name resolution, type correctness, lowering, or
runtime semantics; a syntax-pass result is not language acceptance.
