# Contributing to Aether

Aether is specification-first. A passing prototype does not authorize a language
rule, and an implementation majority does not resolve a specification conflict.

## Before changing anything

1. Read `reports/G0.md` and the affected normative document.
2. Identify the parent PRD Rule IDs and current LDRs.
3. Classify the change as editorial, clarification, compatible extension,
   semantic correction, breaking change, or experimental change.
4. Confirm the change is within K0. K1/K2 work is not currently authorized.

## Semantic changes

A semantic change must include:

- an LCP using the 23-field template from PRD v0.3;
- an LDR recording the decision and dissent;
- precise static/dynamic or lowering rule changes;
- positive, negative, boundary, and observable tests where applicable;
- Rule ID and error-catalog updates;
- compatibility, migration, rollback, and trusted-base analysis;
- regenerated `spec.lock` and G0 report.

Do not change an expected test result merely to match an executor. First determine
whether the defect is in the specification, test, Node executor, or Python
executor, and record an SDR when the specification is ambiguous.

## Pull request gate

Run:

```sh
npm test
git diff --exit-code -- spec/manifests/spec.lock.json reports/G0.json reports/G0.md
```

The pull request must explain which fingerprints, Rule IDs, assumptions, and G0
checks changed. `NO_SEMANTIC_CHANGE` claims require evidence that observable
results and normative hashes are preserved.

## Generated files

Do not edit these by hand:

- `spec/manifests/spec.lock.json`
- `reports/G0.json`
- `reports/G0.md`

Edit their source artifacts and rerun the validator.
