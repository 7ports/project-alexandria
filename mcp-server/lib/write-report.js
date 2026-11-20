'use strict';

/**
 * write-report.js — render a writeKnowledge() result as tool-output text.
 *
 * Both halves exist because a write can half-succeed in two independent ways: the markdown
 * lands on disk but never enters the semantic index (embed failure, or a body that chunks to
 * nothing), or it lands and indexes but never reaches the remote. Each must read as what it
 * is. A bare "0 chunk(s) embedded" once hid a host whose embedder could not load at all.
 *
 * CommonJS (see lib/package.json "type":"commonjs").
 */

// Render the embed-on-write outcome honestly. A failed embed leaves the doc on
// disk but ABSENT from the semantic index — it must never read as a plain
// success, and a 0-chunk result must be qualified, never presented as OK.
function describeEmbed(r) {
  if (r.embed_error) {
    return `❌ NOT searchable — embed-on-write FAILED (${r.embed_error}). The markdown is saved on disk (durable) but is ABSENT from the semantic index; resolve the error and reindex to make it searchable`;
  }
  if (r.indexed === false) {
    return "❌ NOT searchable — embed-on-write did not complete; the doc is on disk but absent from the index";
  }
  if (r.indexed == null) {
    return `${r.chunks} chunk(s) embedded (indexing not attempted — no store)`;
  }
  if (r.chunks === 0) {
    return "⚠️ indexed but produced 0 searchable chunks (empty body?) — the doc is saved but will not surface in search";
  }
  return `${r.chunks} chunk(s) embedded`;
}

/**
 * Human-readable durability summary for a writeKnowledge() result. Makes a
 * `pushed:false` outcome VISIBLE in the tool response (not merely logged) so a
 * caller knows whether their write actually reached the remote, and if not, why.
 */
function describeSync(r) {
  if (r.pushed) {
    const target = `${r.remote || "origin"}/${r.branch || "?"}`;
    return `✅ committed and pushed to ${target}.`;
  }
  const why = r.reason || (r.error ? "error" : "unknown");
  const detail = r.error ? `: ${r.error}` : "";
  if (r.sync_conflict) {
    return `⚠️ committed LOCALLY but NOT pushed — sync conflict (${why}${detail}). Manual reconciliation needed; the doc is saved locally.`;
  }
  if (r.committed) {
    return `⚠️ committed LOCALLY but NOT pushed (${why}${detail}). The doc is saved locally and will sync on the next successful write.`;
  }
  return `⚠️ NOT committed and NOT pushed (${why}${detail}). The markdown + local index are updated; git sync did not run.`;
}

module.exports = { describeEmbed, describeSync };
