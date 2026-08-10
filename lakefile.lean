import Lake

open Lake DSL

package AetherProofs where

@[default_target]
lean_lib AetherProofs where
  srcDir := "spec/proof/mechanized"
