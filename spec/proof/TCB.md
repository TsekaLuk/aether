# K0 Proof Trusted Base

Status: `EXPERIMENTAL`

## Selected checker

LDR-0005 selects Lean 4 `v4.32.2` at commit
`f3b06c705e6c85f5314019d5d3baab0fec5b580c`. The repository toolchain spelling
is `leanprover/lean4:v4.32.2`. The release was published on 2026-07-28.

The official release artifacts used by supported CI/development hosts are:

| Artifact | SHA-256 |
|---|---|
| `lean-4.32.2-linux.tar.zst` | `5f2069e6f5db73780f374ccb49ce8ea649aa20a0cebf0116816744c999ce72aa` |
| `lean-4.32.2-linux_aarch64.tar.zst` | `79aee7ec90f721757d43f75d75fe2e659ded07f0b4e5f1569e92ac9a183e3f81` |
| `lean-4.32.2-darwin.tar.zst` | `2ce646cca9cab59886303a74a12e3a53065f851baac7dc8672782cc0c2d3b408` |
| `lean-4.32.2-darwin_aarch64.tar.zst` | `ea99ead969901b9fe4c7e7bf350b812a0249e9a5cea20474a737c0cc64746bc0` |

These hashes authenticate distribution bytes; they are not proofs that the
binary implements Lean correctly.

## Trust statement

A checked theorem currently depends on:

1. the Lean elaborator producing a declaration and proof term;
2. the Lean kernel checking that term;
3. the compiled Lean executable and its runtime behaving as released;
4. the host operating system, CPU, storage, and artifact transport;
5. the Aether formalization accurately representing the normative specification.

Item 5 is the dominant semantic assumption and cannot be discharged by Lean
alone. Every theorem must link to Rule IDs and a reviewed encoding relation.

## Independent replay

Pull-request CI performs three checks:

- `lake build` with the locked Lean toolchain;
- Lean's bundled `leanchecker` environment checker;
- the independent Rust checker `nanoda`, with `sorryAx` forbidden.

The repository admits no external Lean package dependency. After the pinned Lean
toolchain is present in a local artifact cache, `lake build` requires no network.
For long-term archival, the toolchain artifact and its release hash must travel
with the replay bundle; GitHub Actions cache is convenience, not archival proof.

## Current proof boundary

`mechanized/AetherProofs.lean` proves only a deliberately small allocation-cell
transition fragment. It is not the normative full K0 machine. Its theorems are
classified `PROVED_FRAGMENT`, never `PROVED`, until the complete Core syntax,
state, well-formedness relation, and encoding correspondence are mechanized.

No `axiom`, `sorry`, `admit`, or external oracle is permitted in a proof counted
by G0. CI's independent checker is configured to reject `sorryAx`.
