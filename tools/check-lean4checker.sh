#!/usr/bin/env bash
set -euo pipefail

checker_commit="da26eb05e9959402afcb9bd6dfe5dc4f700f70d6"
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
check_root=$(mktemp -d "${TMPDIR:-/tmp}/aether-lean4checker.XXXXXX")
trap 'rm -rf "$check_root"' EXIT

git init --quiet "$check_root/lean4checker"
git -C "$check_root/lean4checker" remote add origin https://github.com/leanprover/lean4checker.git
git -C "$check_root/lean4checker" fetch --quiet --depth 1 origin "$checker_commit"

fetched_commit=$(git -C "$check_root/lean4checker" rev-parse FETCH_HEAD)
if [[ "$fetched_commit" != "$checker_commit" ]]; then
  echo "lean4checker commit mismatch: expected $checker_commit, got $fetched_commit" >&2
  exit 1
fi

git -C "$check_root/lean4checker" checkout --quiet --detach "$checker_commit"
cp "$repo_root/lean-toolchain" "$check_root/lean4checker/lean-toolchain"

(
  cd "$check_root/lean4checker"
  lake build lean4checker
)

cd "$repo_root"
lake env "$check_root/lean4checker/.lake/build/bin/lean4checker" AetherProofs
