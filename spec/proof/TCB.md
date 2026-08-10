# K0 Proof Trusted Base

Status: `EXPERIMENTAL`

## Selected checker

LDR-0005 selects Lean 4 `v4.24.0` at commit
`797c613eb9b6d4ec95db23e3e00af9ac6657f24b`. The repository toolchain spelling
is `leanprover/lean4:v4.24.0`. The release was published on 2025-10-14. This
version is deliberately older than the latest Lean release: it is the newest
line for which the selected independent nanoda checker is replay-compatible.

The official release artifacts used by supported CI/development hosts are:

| Artifact | SHA-256 |
|---|---|
| `lean-4.24.0-linux.tar.zst` | `b14f5e5159219dd1a1956c3b806813319f5e94ccd5bdfd56f54520609a5bb5ec` |
| `lean-4.24.0-linux_aarch64.tar.zst` | `237f8ef43fb40d16681871fb04b2c56f023afc02a5a3877831d35dd493823c23` |
| `lean-4.24.0-darwin.tar.zst` | `a5ef0fb0e14645eaa0e60bc6ba39a07e7deeeec73dc93ce7195b837eb9de2c9f` |
| `lean-4.24.0-darwin_aarch64.tar.zst` | `17ee554702c199fc03f37b1c3708245671c93f5d932dcff55a03fa6cdb5e5adf` |

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
- `lean4checker` at commit `da26eb05e9959402afcb9bd6dfe5dc4f700f70d6`;
- `ammkrn/lean4export`'s `format2024` protocol line at commit
  `eb023e55e0852a9bf9b569ecefc42d54338b0c8f`;
- the independent Rust checker `nanoda` at commit
  `e5438ac0a85a036b6dfe093aa457bc3448498014`, with `sorryAx` forbidden.

Nanoda is built with Rust `1.85.0` at commit
`4d91de4e48198da2e33413efdcd9cd2cc0c46688` and Cargo `1.85.0` at commit
`d73d2caf9e41a39daf2a8d6ce60ec80bf354d2a7`. Cargo runs with `--locked`;
the upstream `Cargo.lock` fixes transitive versions and crate checksums.

The official `leanprover/lean4export` stream is not interchangeable with the
`format2024` protocol consumed by this Nanoda version. The replay script pins
the compatible fork and commit explicitly. Nanoda is configured to skip an
unreferenced `sorryAx` declaration from Lean's prelude but to fail if any
checked declaration depends on it; the source validator separately rejects
`sorry`, `admit`, and `axiom` in Aether proof files.

The repository admits no external Lean package dependency. `lake build` requires
no network once the Lean toolchain is cached. Full independent replay also needs
the pinned checker source trees and checksum-locked Cargo crates; its first run
therefore uses the network unless those artifacts are already mirrored. For
long-term archival, all toolchain, source, and crate artifacts must travel with
the replay bundle; GitHub Actions cache is convenience, not archival proof.

## Current proof boundary

`mechanized/AetherProofs.lean` proves only a deliberately small allocation-cell
transition fragment. It is not the normative full K0 machine. Its theorems are
classified `PROVED_FRAGMENT`, never `PROVED`, until the complete Core syntax,
state, well-formedness relation, and encoding correspondence are mechanized.

No `axiom`, `sorry`, `admit`, or external oracle is permitted in a proof counted
by G0. CI's independent checker is configured to reject `sorryAx`.
