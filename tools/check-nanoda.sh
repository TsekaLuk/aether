#!/usr/bin/env bash
set -euo pipefail

export_commit="eb023e55e0852a9bf9b569ecefc42d54338b0c8f"
nanoda_commit="e5438ac0a85a036b6dfe093aa457bc3448498014"
rust_toolchain="1.85.0"
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
check_root=$(mktemp -d "${TMPDIR:-/tmp}/aether-nanoda.XXXXXX")
trap 'rm -rf "$check_root"' EXIT

git init --quiet "$check_root/lean4export"
git -C "$check_root/lean4export" remote add origin https://github.com/ammkrn/lean4export.git
git -C "$check_root/lean4export" fetch --quiet --depth 1 origin "$export_commit"
fetched_export_commit=$(git -C "$check_root/lean4export" rev-parse FETCH_HEAD)
if [[ "$fetched_export_commit" != "$export_commit" ]]; then
  echo "lean4export commit mismatch: expected $export_commit, got $fetched_export_commit" >&2
  exit 1
fi
git -C "$check_root/lean4export" checkout --quiet --detach "$export_commit"
cp "$repo_root/lean-toolchain" "$check_root/lean4export/lean-toolchain"
(
  cd "$check_root/lean4export"
  lake build
)

git init --quiet "$check_root/nanoda"
git -C "$check_root/nanoda" remote add origin https://github.com/ammkrn/nanoda_lib.git
git -C "$check_root/nanoda" fetch --quiet --depth 1 origin "$nanoda_commit"
fetched_nanoda_commit=$(git -C "$check_root/nanoda" rev-parse FETCH_HEAD)
if [[ "$fetched_nanoda_commit" != "$nanoda_commit" ]]; then
  echo "nanoda commit mismatch: expected $nanoda_commit, got $fetched_nanoda_commit" >&2
  exit 1
fi
git -C "$check_root/nanoda" checkout --quiet --detach "$nanoda_commit"
cargo "+$rust_toolchain" build --locked --release --manifest-path "$check_root/nanoda/Cargo.toml"

export_file="$check_root/aether.export"
cd "$repo_root"
lake env "$check_root/lean4export/.lake/build/bin/lean4export" AetherProofs > "$export_file"

config_file="$check_root/nanoda.json"
printf '%s\n' \
  '{' \
  "  \"export_file_path\": \"$export_file\"," \
  '  "use_stdin": false,' \
  '  "permitted_axioms": ["propext", "Classical.choice", "Quot.sound", "Lean.trustCompiler"],' \
  '  "unpermitted_axiom_hard_error": false,' \
  '  "nat_extension": true,' \
  '  "string_extension": true,' \
  '  "print_success_message": true' \
  '}' > "$config_file"

"$check_root/nanoda/target/release/nanoda_bin" "$config_file"
