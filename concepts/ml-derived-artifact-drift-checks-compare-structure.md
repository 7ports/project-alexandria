---
id: ml-derived-artifact-drift-checks-compare-structure
type: concept
title: "CI drift checks on ML-derived artifacts must compare structure, not bytes"
summary: "Embeddings differ in the last bits across CPUs and UMAP/k-means amplify that, so a byte-for-byte 'is the committed artifact fresh?' check flaps between runners. Compare the identity of what the artifact describes instead."
tags:
  - ci
  - embeddings
  - umap
  - determinism
  - generated-artifacts
  - drift-check
status: active
embedding_version: 1
---

## The idea in one paragraph

A common CI guard regenerates a committed artifact in memory and fails if it differs from the committed copy ("you edited the sources but forgot to regenerate"). For artifacts derived from ML inference, such as embedding vectors, a UMAP/t-SNE layout, k-means clusters or similarity edges, a byte compare is the wrong test. The same model on the same input gives slightly different floats on different CPUs. Seeded dimensionality reduction then amplifies that noise into a visibly different layout. Compare what the artifact *describes* (which documents and chunks it contains), not its exact numbers.

## The failure shape

- The check fails, then passes on a re-run of the same commit, with no changes in between. The only difference is which runner picked up the job.
- Seeding the PRNG (UMAP `random`, k-means `seed`, `Math.random` override) does not help. The randomness is not in the PRNG but in the input vectors: ONNX/BLAS kernels choose different SIMD paths (AVX2 vs AVX-512, FMA contraction, thread-count-dependent reductions), so the last bits of float32 results differ.
- UMAP is iterative and nonlinear. A 1e-7 change in an input vector can change neighbour ordering, and then every coordinate moves.

## Why quantizing is not enough

Rounding vectors (say to 1e-4) before reduction makes drift rarer, but a value that sits right on a rounding boundary still flips. When it does, the whole layout changes again. You end up with a flaky check that fails once a month instead of once a week.

## The rule

The drift check asks "does the committed artifact describe the current sources?" Answer that question directly:

- Compare the **entity set**: document ids, chunk ids, titles, tags, URLs, chunk counts, row indexes, schema/model version.
- Compare **sizes** of binary vector files (row count × dim × 4 bytes), not their bytes.
- Ignore float-valued fields: coordinates, cluster labels, edge weights, the vectors themselves.
- Report *which* entities are missing or stale, so the failure tells you what to regenerate.

Let the publish job (on the main branch) always regenerate and commit the full artifact. The PR check only has to catch "the content changed and nobody regenerated", and that always shows up as a changed entity set.

## When it does not apply

If the artifact is produced by deterministic integer or string processing (manifests, indexes of filenames, sorted JSON), keep the byte compare: it is exact and catches more. If you need bit-exact embeddings across machines, pin the hardware or the inference backend's deterministic mode. That is usually more expensive than the structural check.

## Related

- `committed-generated-artifacts-regenerate-never-merge`: on a merge conflict in a generated artifact, regenerate it rather than picking a side.
