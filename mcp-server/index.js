#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { createRequire } from "module";
import {
  withMetrics,
  guideReadsTotal,
  guideUpdatesTotal,
  searchQueriesTotal,
  guidesTotal,
} from './metrics.js';

// lib/ is CommonJS (lib/package.json "type":"commonjs"); load it from this ESM
// module via createRequire. Wrapped so a missing native dep (better-sqlite3 /
// sqlite-vec) degrades gracefully instead of crashing the server at boot.
const require = createRequire(import.meta.url);
let indexStore = null;   // CJS module: openIndex/upsertDoc/knn/close
let reindexLib = null;   // CJS module: reindexAll/reconcileIndex/manifestHash
let searchLib = null;    // CJS module: searchKnowledge (semantic + lexical fallback)
try {
  indexStore = require('./lib/index-store');
  reindexLib = require('./lib/reindex');
} catch (err) {
  console.error(`[alexandria] vector index unavailable (lexical fallback only): ${err.message}`);
}
// search.js depends only on embedder + index-store + frontmatter; load it
// separately so the lexical fallback stays available even if the native index
// modules above fail to load.
try {
  searchLib = require('./lib/search');
} catch (err) {
  console.error(`[alexandria] search module unavailable: ${err.message}`);
}
// knowledge.js generalizes read/write/list across all content types (guide |
// concept | article | reference) with embed-on-write + git sync. It pulls in
// index-store/embedder, so guard the require so a missing native dep degrades
// to the legacy guide-only tools rather than crashing boot.
let knowledgeLib = null;   // CJS module: writeKnowledge/readKnowledge/listKnowledge
try {
  knowledgeLib = require('./lib/knowledge');
} catch (err) {
  console.error(`[alexandria] knowledge module unavailable: ${err.message}`);
}
// refresh.js provides the TTL refresh-on-read trigger (maybeRefresh) and the
// non-blocking background pull+reconcile (refreshFromRemote). It pulls in
// reindex/index-store (native deps), so guard the require — without it, reads
// simply skip the freshness check and serve the local index as before.
let refreshLib = null;     // CJS module: getLastSyncOk/setLastSyncOk/maybeRefresh/refreshFromRemote
try {
  refreshLib = require('./lib/refresh');
} catch (err) {
  console.error(`[alexandria] refresh module unavailable (no TTL refresh-on-read): ${err.message}`);
}

// Refresh-on-read TTL: how long since the last successful sync before a read
// kicks a background refresh. Default 120 s; override via SYNC_TTL (seconds)
// or SYNC_TTL_MS (milliseconds).
const SYNC_TTL_MS = process.env.SYNC_TTL_MS
  ? Number(process.env.SYNC_TTL_MS)
  : process.env.SYNC_TTL
    ? Number(process.env.SYNC_TTL) * 1000
    : 120000;

/**
 * Non-blocking refresh-on-read gate. Called at the top of every READ tool: if
 * the index is staler than SYNC_TTL it fires a background git fetch + reconcile
 * and returns immediately, so the query always serves the current index without
 * waiting on the network. No-op when the refresh module failed to load.
 */
function triggerRefreshOnRead() {
  if (!refreshLib) return;
  try {
    refreshLib.maybeRefresh({
      ttlMs: SYNC_TTL_MS,
      now: Date.now(),
      trigger: () =>
        refreshLib
          .refreshFromRemote({ store: getStore() })
          .catch((err) => console.error(`[alexandria] background refresh failed: ${err.message}`)),
    });
  } catch (err) {
    console.error(`[alexandria] refresh-on-read gate failed: ${err.message}`);
  }
}

// Lazy singleton index-store handle — opened on first use so server boot never
// blocks on the native module or DB file creation.
let knowledgeStore = null;
function getStore() {
  if (!indexStore) return null;
  if (knowledgeStore) return knowledgeStore;
  try {
    knowledgeStore = indexStore.openIndex();
  } catch (err) {
    console.error(`[alexandria] failed to open vector index: ${err.message}`);
    knowledgeStore = null;
  }
  return knowledgeStore;
}

const CONTENT_DIRS = (reindexLib && reindexLib.DEFAULT_CONTENT_DIRS) || [
  'guides', 'concepts', 'articles', 'references',
];

// Resolve guides directory relative to this script
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
// On Windows, remove leading slash from /C:/... paths
const normalizedScriptDir = process.platform === "win32" && SCRIPT_DIR.startsWith("/")
  ? SCRIPT_DIR.slice(1)
  : SCRIPT_DIR;
const GUIDES_DIR = path.resolve(normalizedScriptDir, "..", "guides");
const TEMPLATES_DIR = path.resolve(normalizedScriptDir, "..", "templates");
const RECOMMENDATIONS_PATH = path.resolve(normalizedScriptDir, "..", "recommendations.json");
const ONBOARDING_PATH = path.resolve(normalizedScriptDir, "..", "onboarding.json");
const REPO_ROOT = path.resolve(normalizedScriptDir, "..");

/**
 * Run a git command in the repo root directory.
 * Returns a promise that resolves with { stdout, stderr } or rejects on error.
 */
function gitExec(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: REPO_ROOT }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`git ${args[0]} failed: ${stderr || error.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Auto-commit and push a guide file after it is written.
 * Runs asynchronously (fire-and-forget) so it does not block the MCP response.
 * Errors are logged to stderr but never propagated to the caller.
 */
function gitCommitAndPush(guideFilename, existed) {
  const relPath = `guides/${guideFilename}`;
  const verb = existed ? "update" : "create";
  const guideName = guideFilename.replace(/\.md$/, "");
  const commitMsg = `docs: ${verb} ${guideName} guide`;

  // Fire-and-forget: chain git add -> commit -> push, log errors to stderr
  (async () => {
    try {
      await gitExec(["add", relPath]);
      await gitExec(["commit", "-m", commitMsg]);
    } catch (err) {
      // If there's nothing to commit (no changes), just skip the push
      if (err.message && err.message.includes("nothing to commit")) {
        return;
      }
      console.error(`[alexandria] git add/commit failed: ${err.message}`);
      return;
    }
    try {
      // Rebase onto origin/main first so worktree or other out-of-band pushes
      // never leave us in a non-fast-forward state.
      await gitExec(["pull", "--rebase", "origin", "main"]);
      await gitExec(["push", "origin", "main"]);
    } catch (err) {
      console.error(`[alexandria] git push failed (guide saved locally): ${err.message}`);
    }
  })();
}

function getGuideFiles() {
  try {
    return fs.readdirSync(GUIDES_DIR)
      .filter(f => f.endsWith(".md"))
      .map(f => ({
        name: f.replace(".md", ""),
        filename: f,
        path: path.join(GUIDES_DIR, f),
      }));
  } catch {
    return [];
  }
}

function readGuide(filename) {
  const filepath = path.join(GUIDES_DIR, filename.endsWith(".md") ? filename : `${filename}.md`);
  if (!fs.existsSync(filepath)) return null;
  return fs.readFileSync(filepath, "utf-8");
}

// Surfaced to every client on `initialize` (SDK: server/index.js returns options.instructions).
// Universal push of Alexandria's recall-before / record-after / boundary contract.
const ALEXANDRIA_INSTRUCTIONS =
  "Alexandria is a shared, project-agnostic knowledge base. **Recall before acting:** call `recall_context`/`search_knowledge` before any tool setup or non-trivial technical decision. **Record after:** after (1) setting up a tool, (2) fixing a non-obvious error, (3) finding a version/platform gotcha, (4) getting a tricky config/command/API right, or (5) at session close, call `write_knowledge`/`update_guide` — recording is the default, not an afterthought. **Boundary:** record ONLY general knowledge that would help an unrelated project. If a finding names a host/path/secret/client/project, genericise it (`<your-project>`, `<API_KEY>`, `<path/to/repo>`) and record the general lesson; never record the specifics — those stay in the project's CLAUDE.md.";

const server = new McpServer(
  {
    name: "alexandria",
    version: "1.0.0",
  },
  { instructions: ALEXANDRIA_INSTRUCTIONS }
);

// Tool: List all available guides (compact — one line per guide)
server.tool(
  "list_guides",
  "List all available tooling setup guides. Returns one line per guide (name + title). Use this first to see what exists, then read_guide or quick_setup for details.",
  {},
  async () => {
    return withMetrics("list_guides", async () => {
      const guides = getGuideFiles();
      guidesTotal.set(guides.length);
      if (guides.length === 0) {
        return { content: [{ type: "text", text: "No guides found." }] };
      }
      const list = guides.map(g => {
        const content = readGuide(g.filename);
        const titleMatch = content?.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : g.name;
        return `- ${g.name} — ${title}`;
      }).join("\n");
      return { content: [{ type: "text", text: list }] };
    });
  }
);

// Tool: Quick setup — returns only actionable commands and config, no prose
server.tool(
  "quick_setup",
  "Get ONLY the actionable install commands, config snippets, and troubleshooting from a guide. Much cheaper than read_guide — use this when you already know what tool to install and just need the steps. Falls back to extracting code blocks if no Quick Reference section exists.",
  { name: z.string().describe("Guide name (e.g., 'coplay-mcp-server', 'beads')") },
  async ({ name }) => {
    return withMetrics("quick_setup", async () => {
      const content = readGuide(name);
      if (!content) {
        const guides = getGuideFiles();
        return { content: [{ type: "text", text: `Guide '${name}' not found. Available: ${guides.map(g => g.name).join(", ")}` }] };
      }

      guideReadsTotal.inc({ guide: name ?? 'unknown' });

      const sections = [];

      // 1. Try Quick Reference block first (cheapest)
      const qrMatch = content.match(/## Quick Reference\s*\n([\s\S]*?)(?=\n## (?!Quick Reference)|\n---|\n\*Last updated)/);
      if (qrMatch) {
        sections.push(qrMatch[1].trim());
      } else {
        // 2. Fallback: extract code blocks and their immediate headings
        const lines = content.split("\n");
        let inCodeBlock = false;
        let codeBuffer = [];
        let lastHeading = "";

        for (const line of lines) {
          if (line.startsWith("```")) {
            if (!inCodeBlock) {
              inCodeBlock = true;
              if (lastHeading && !codeBuffer.some(b => b.startsWith(lastHeading))) {
                codeBuffer.push(lastHeading);
              }
              codeBuffer.push(line);
            } else {
              codeBuffer.push(line);
              codeBuffer.push("");
              inCodeBlock = false;
            }
          } else if (inCodeBlock) {
            codeBuffer.push(line);
          } else if (line.startsWith("#")) {
            lastHeading = line;
          }
        }

        if (codeBuffer.length > 0) {
          sections.push(codeBuffer.join("\n").trim());
        }
      }

      // 3. Always include Troubleshooting table if present
      const troubleMatch = content.match(/## Troubleshooting\s*\n([\s\S]*?)(?=\n## |\n---|\n\*Last updated|$)/);
      if (troubleMatch) {
        sections.push("## Troubleshooting\n" + troubleMatch[1].trim());
      }

      if (sections.length === 0) {
        return { content: [{ type: "text", text: `No actionable content extracted from '${name}'. Use read_guide for full content.` }] };
      }

      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : name;
      return { content: [{ type: "text", text: `# ${title} — Quick Setup\n\n${sections.join("\n\n---\n\n")}` }] };
    });
  }
);

// Tool: Read a specific guide (full content — use quick_setup when possible)
server.tool(
  "read_guide",
  "Read the FULL content of a guide. Prefer quick_setup when you just need install steps. Use read_guide only when troubleshooting, learning about a tool for the first time, or when quick_setup didn't have enough detail.",
  { name: z.string().describe("Guide name (e.g., 'coplay-mcp-server', 'beads', 'git-mcp-server')") },
  async ({ name }) => {
    return withMetrics("read_guide", async () => {
      const content = readGuide(name);
      if (!content) {
        const guides = getGuideFiles();
        const available = guides.map(g => g.name).join(", ");
        return { content: [{ type: "text", text: `Guide '${name}' not found. Available guides: ${available}` }] };
      }
      guideReadsTotal.inc({ guide: name ?? 'unknown' });
      return { content: [{ type: "text", text: content }] };
    });
  }
);

// Tool: Search across all guides
server.tool(
  "search_guides",
  "Search for keywords across all tooling setup guides in Project Alexandria",
  { query: z.string().describe("Search term or phrase to find across all guides") },
  async ({ query }) => {
    return withMetrics("search_guides", async () => {
      searchQueriesTotal.inc();
      const guides = getGuideFiles();
      const queryLower = query.toLowerCase();
      const results = [];

      for (const guide of guides) {
        const content = readGuide(guide.filename);
        if (!content) continue;

        const lines = content.split("\n");
        const matches = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            // Include surrounding context (1 line before, 1 after)
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length - 1, i + 1);
            const context = lines.slice(start, end + 1).join("\n");
            matches.push({ line: i + 1, context });
          }
        }

        if (matches.length > 0) {
          results.push({
            guide: guide.name,
            matchCount: matches.length,
            matches: matches.slice(0, 5), // Limit to 5 matches per guide
          });
        }
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No results found for '${query}'.` }] };
      }

      const output = results.map(r => {
        const matchText = r.matches.map(m =>
          `  Line ${m.line}:\n${m.context.split("\n").map(l => `    ${l}`).join("\n")}`
        ).join("\n\n");
        return `## ${r.guide} (${r.matchCount} match${r.matchCount > 1 ? "es" : ""})\n\n${matchText}`;
      }).join("\n\n---\n\n");

      return { content: [{ type: "text", text: `# Search Results for '${query}'\n\n${output}` }] };
    });
  }
);

// Tool: Update or create a guide
server.tool(
  "update_guide",
  "Update an existing guide or create a new one in Project Alexandria. Use this to keep documentation current as you learn new things about tool setup. Call this after any write-back trigger (tool setup, non-obvious fix, version/platform gotcha, tricky config, or session close). Record ONLY general, project-agnostic knowledge; genericise host/path/secret/client/project specifics first.",
  {
    name: z.string().describe("Guide name (e.g., 'my-new-tool'). Will create/overwrite guides/<name>.md"),
    content: z.string().describe("Full markdown content for the guide"),
  },
  async ({ name, content }) => {
    return withMetrics("update_guide", async () => {
      const filename = name.endsWith(".md") ? name : `${name}.md`;
      const filepath = path.join(GUIDES_DIR, filename);
      const existed = fs.existsSync(filepath);

      try {
        fs.mkdirSync(GUIDES_DIR, { recursive: true });
        fs.writeFileSync(filepath, content, "utf-8");
        guideUpdatesTotal.inc({ guide: name ?? 'unknown' });

        // Fire-and-forget: auto-commit and push so GitHub Pages rebuilds
        gitCommitAndPush(filename, existed);

        return {
          content: [{
            type: "text",
            text: `Guide '${filename}' ${existed ? "updated" : "created"} successfully at ${filepath}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error writing guide: ${err.message}` }] };
      }
    });
  }
);

// Tool: Get the guide template
server.tool(
  "get_guide_template",
  "Get the template for creating new tooling setup guides",
  {},
  async () => {
    return withMetrics("get_guide_template", async () => {
      const templatePath = path.join(TEMPLATES_DIR, "guide-template.md");
      try {
        const content = fs.readFileSync(templatePath, "utf-8");
        return { content: [{ type: "text", text: content }] };
      } catch {
        return { content: [{ type: "text", text: "Template not found." }] };
      }
    });
  }
);

// Tool: Get project setup recommendations
server.tool(
  "get_project_setup_recommendations",
  "Get recommended tools and setup steps for a new coding project. Always call this when initializing or setting up a new project to ensure critical tools like beads are configured.",
  {
    project_type: z.string().optional().describe("Type of project (e.g., 'unity', 'web', 'firebase', 'general'). Helps surface conditional recommendations. Omit for general recommendations."),
  },
  async ({ project_type }) => {
    return withMetrics("get_project_setup_recommendations", async () => {
      let recommendations;
      try {
        recommendations = JSON.parse(fs.readFileSync(RECOMMENDATIONS_PATH, "utf-8"));
      } catch {
        return { content: [{ type: "text", text: "Could not load recommendations.json" }] };
      }

      const setup = recommendations.project_setup;
      const sections = [];

      // Always-recommended tools
      if (setup.always?.length > 0) {
        const items = setup.always.map(r => {
          const commands = r.setup_commands ? `\n  Setup: \`${r.setup_commands.join(" && ")}\`` : "";
          return `- **[${r.priority.toUpperCase()}] ${r.tool}** — ${r.reason}${commands}\n  When: ${r.when}\n  Guide: \`read_guide("${r.guide}")\``;
        }).join("\n\n");
        sections.push(`## Always Required\n\n${items}`);
      }

      // Conditional tools matching project type
      if (project_type && setup.conditional?.length > 0) {
        const typeLower = project_type.toLowerCase();
        const matching = setup.conditional.filter(r => typeLower.includes(r.condition));
        if (matching.length > 0) {
          const items = matching.map(r =>
            `- **[${r.priority.toUpperCase()}] ${r.tool}** — ${r.reason}\n  Guide: \`read_guide("${r.guide}")\``
          ).join("\n\n");
          sections.push(`## Recommended for ${project_type} Projects\n\n${items}`);
        }
      }

      // Always show other conditional tools as "also available"
      if (setup.conditional?.length > 0) {
        const typeLower = (project_type || "").toLowerCase();
        const others = setup.conditional.filter(r => !typeLower || !typeLower.includes(r.condition));
        if (others.length > 0) {
          const items = others.map(r =>
            `- **${r.tool}** (for ${r.condition} projects) — ${r.reason}`
          ).join("\n");
          sections.push(`## Also Available\n\n${items}`);
        }
      }

      const output = `# Project Setup Recommendations\n\n${sections.join("\n\n---\n\n")}`;
      return { content: [{ type: "text", text: output }] };
    });
  }
);

// Tool: Get onboarding instructions for a new Claude instance
server.tool(
  "get_onboarding",
  "Get the full onboarding payload for a Claude instance that has Alexandria installed. This returns the behavioral contract, memory templates, and configuration that every Claude instance should adopt to collaboratively maintain this shared knowledge base. Call this when first discovering Alexandria is available, or when setting up Alexandria on a new machine.",
  {},
  async () => {
    return withMetrics("get_onboarding", async () => {
      try {
        const onboarding = JSON.parse(fs.readFileSync(ONBOARDING_PATH, "utf-8"));
        const contract = onboarding.behavioral_contract;
        const memories = onboarding.memory_templates;

        const rules = contract.rules.map(r =>
          `### ${r.id}\n**Rule:** ${r.rule}\n**Why:** ${r.why}`
        ).join("\n\n");

        const output = `# Alexandria Onboarding — Collaborative Maintenance Contract

${contract.summary}

---

## Behavioral Rules

${rules}

---

## Memory Templates

Save these to your project-level or global memory system so this contract persists across conversations.

### Project Memory
\`\`\`
Name: ${memories.project_memory.name}
Type: ${memories.project_memory.type}
Description: ${memories.project_memory.description}

${memories.project_memory.content}
\`\`\`

### Feedback Memory
\`\`\`
Name: ${memories.feedback_memory.name}
Type: ${memories.feedback_memory.type}
Description: ${memories.feedback_memory.description}

${memories.feedback_memory.content}
\`\`\`

---

## Configuration

### MCP Server Entry (for ~/.claude.json)
\`\`\`json
${JSON.stringify(onboarding.claude_code_config.mcp_server_entry, null, 2)}
\`\`\`

### Permission Entry (for ~/.claude/settings.json)
Add to the \`permissions.allow\` array:
\`\`\`
"${onboarding.claude_code_config.permissions_entry}"
\`\`\`
`;

        return { content: [{ type: "text", text: output }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Could not load onboarding data: ${err.message}` }] };
      }
    });
  }
);

// Tool: Rebuild the vector knowledge index from the markdown source-of-record
server.tool(
  "reindex_knowledge",
  "Rebuild the semantic vector index from the markdown source-of-record (guides/concepts/articles/references). Idempotent: docs whose content is unchanged are skipped unless force=true. Returns a summary of docs indexed, chunks embedded, and docs skipped.",
  {
    force: z.boolean().optional().describe("Re-embed every doc even if its content is unchanged (default false)"),
  },
  async ({ force }) => {
    return withMetrics("reindex_knowledge", async () => {
      const store = getStore();
      if (!store || !reindexLib) {
        return { content: [{ type: "text", text: "Vector index unavailable — reindex skipped. (Install better-sqlite3 + sqlite-vec to enable semantic search.)" }] };
      }
      try {
        const r = await reindexLib.reindexAll(store, {
          contentDirs: CONTENT_DIRS,
          force: !!force,
        });
        return {
          content: [{
            type: "text",
            text: `Reindex complete: ${r.docs} docs scanned, ${r.chunksEmbedded} chunks embedded, ${r.skipped} skipped${force ? " (forced)" : ""}.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Reindex failed: ${err.message}` }] };
      }
    });
  }
);

// Tool: Semantic search across the whole knowledge base (with lexical fallback)
server.tool(
  "search_knowledge",
  "PRIMARY search. Semantic (vector) search across all knowledge — guides, concepts, articles, references — returning the most relevant CHUNKS, not whole docs. Use this before acting to recall what Alexandria already knows. Filter by type, cap with top_k, set min_score to drop weak hits. Pass lexical:true (or when the index is unavailable it degrades automatically) to force the legacy substring scan for exact-string lookups.",
  {
    query: z.string().describe("Natural-language query or topic to search for"),
    type: z.enum(["guide", "concept", "article", "reference"]).optional()
      .describe("Restrict results to a single content type"),
    top_k: z.number().int().positive().optional().describe("Max hits to return (default 8)"),
    min_score: z.number().optional().describe("Drop semantic hits below this cosine score (default 0)"),
    lexical: z.boolean().optional().describe("Force the substring fallback instead of semantic search (default false)"),
  },
  async ({ query, type, top_k, min_score, lexical }) => {
    return withMetrics("search_knowledge", async () => {
      searchQueriesTotal.inc();
      triggerRefreshOnRead(); // non-blocking; serves the current index immediately

      if (!searchLib) {
        return { content: [{ type: "text", text: "Search module unavailable." }] };
      }

      let result;
      try {
        result = await searchLib.searchKnowledge(getStore(), query, {
          type,
          top_k,
          min_score,
          lexical,
        });
      } catch (err) {
        return { content: [{ type: "text", text: `Search failed: ${err.message}` }] };
      }

      const { mode, hits } = result;
      if (!hits || hits.length === 0) {
        return { content: [{ type: "text", text: `No results found for '${query}' (mode: ${mode}). No guide covers this yet — if you work on '${query}', you are the agent who should write_knowledge a general, project-agnostic guide once you solve it.` }] };
      }

      const body = hits.map((h, i) => {
        const heading = h.heading_path ? ` › ${h.heading_path}` : "";
        const score = typeof h.score === "number" ? h.score.toFixed(3) : String(h.score);
        return `${i + 1}. [${h.type}] ${h.title} (${h.doc_id})${heading} — score ${score}\n   ${h.snippet}`;
      }).join("\n\n");

      return { content: [{ type: "text", text: `# search_knowledge — ${mode}\nResults for '${query}':\n\n${body}` }] };
    });
  }
);

// Tool: Recall prior knowledge about a topic — multi-type, deduped-by-doc briefing
server.tool(
  "recall_context",
  "Recall what Alexandria already knows about a TOPIC, as a compact briefing. Runs a semantic search across all content types (or just `types`), deduplicated to the single best chunk per doc, returned best-first — one entry per doc. Call this at task start to pull prior learnings into context. Wrapper over search_knowledge; degrades to the lexical fallback when the index is unavailable.",
  {
    topic: z.string().describe("Topic or question to recall prior knowledge about"),
    top_k: z.number().int().positive().optional().describe("Max docs to brief on (default 12)"),
    types: z.array(z.enum(["guide", "concept", "article", "reference"])).optional()
      .describe("Restrict recall to these content types (default: all types)"),
  },
  async ({ topic, top_k, types }) => {
    return withMetrics("recall_context", async () => {
      searchQueriesTotal.inc();
      triggerRefreshOnRead(); // non-blocking; serves the current index immediately

      if (!searchLib || typeof searchLib.recallContext !== "function") {
        return { content: [{ type: "text", text: "Search module unavailable." }] };
      }

      let briefing;
      try {
        briefing = await searchLib.recallContext(getStore(), topic, { top_k, types });
      } catch (err) {
        return { content: [{ type: "text", text: `Recall failed: ${err.message}` }] };
      }

      if (!briefing || briefing.length === 0) {
        return { content: [{ type: "text", text: `No prior knowledge found for '${topic}'. No guide covers this yet — if you work on '${topic}', you are the agent who should write_knowledge a general, project-agnostic guide once you solve it.` }] };
      }

      const body = briefing.map((b, i) => {
        const score = typeof b.score === "number" ? b.score.toFixed(3) : String(b.score);
        return `${i + 1}. [${b.type}] ${b.title} (${b.doc_id}) — score ${score}\n   ${b.snippet}\n   → read_knowledge("${b.doc_id}")`;
      }).join("\n\n");

      return { content: [{ type: "text", text: `# recall_context — '${topic}'\n${briefing.length} doc(s):\n\n${body}` }] };
    });
  }
);

// Tool: Write (create/update) a knowledge doc of any content type
server.tool(
  "write_knowledge",
  "Create or update a knowledge doc of ANY type (guide|concept|article|reference). Composes YAML frontmatter from metadata, writes <type-dir>/<name>.md as the source-of-record, embeds it into the semantic index immediately (embed-on-write), then commits & syncs to git asynchronously. Prefer this over update_guide for non-guide content. Call this after any write-back trigger (tool setup, non-obvious fix, version/platform gotcha, tricky config, or session close). Record ONLY general, project-agnostic knowledge; genericise host/path/secret/client/project specifics first.",
  {
    name: z.string().describe("Slug (filename without .md), e.g. 'embed-on-write'"),
    type: z.enum(["guide", "concept", "article", "reference"]).describe("Content type → target directory"),
    content: z.string().describe("Markdown body only — frontmatter is composed for you from metadata"),
    metadata: z
      .object({
        title: z.string().optional(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source_urls: z.array(z.string()).optional(),
        supersedes: z.string().optional(),
        status: z.string().optional(),
      })
      .optional()
      .describe("Frontmatter fields (id and type are set automatically)"),
  },
  async ({ name, type, content, metadata }) => {
    return withMetrics("write_knowledge", async () => {
      if (!knowledgeLib) {
        return { content: [{ type: "text", text: "Knowledge module unavailable." }] };
      }
      try {
        const r = await knowledgeLib.writeKnowledge(
          { name, type, content, metadata },
          { store: getStore() }
        );
        guideUpdatesTotal.inc({ guide: name ?? "unknown" });
        return {
          content: [{
            type: "text",
            text: `Wrote ${r.path} — ${r.chunks} chunk(s) embedded${r.committed ? ", git sync enqueued" : ""}.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error writing knowledge: ${err.message}` }] };
      }
    });
  }
);

// Tool: Read the full markdown of a knowledge doc (rare full-text fallback)
server.tool(
  "read_knowledge",
  "Read the FULL markdown of a knowledge doc directly from disk (the source-of-record). This is the rare full-text fallback — prefer search_knowledge for routine recall. Pass raw:true to strip YAML frontmatter and return only the body.",
  {
    name: z.string().describe("Doc slug (filename without .md)"),
    type: z.enum(["guide", "concept", "article", "reference"]).optional()
      .describe("Restrict the lookup to a single content type"),
    raw: z.boolean().optional().describe("Strip frontmatter, returning only the body (default false)"),
  },
  async ({ name, type, raw }) => {
    return withMetrics("read_knowledge", async () => {
      triggerRefreshOnRead(); // non-blocking; serves the current source-of-record immediately
      if (!knowledgeLib) {
        return { content: [{ type: "text", text: "Knowledge module unavailable." }] };
      }
      const text = await knowledgeLib.readKnowledge({ name, type, raw: !!raw });
      if (text == null) {
        return { content: [{ type: "text", text: `Knowledge doc '${name}' not found${type ? ` (type ${type})` : ""}.` }] };
      }
      guideReadsTotal.inc({ guide: name ?? "unknown" });
      return { content: [{ type: "text", text }] };
    });
  }
);

// Tool: List knowledge docs across all content types
server.tool(
  "list_knowledge",
  "List knowledge docs across all content types (or one type). Returns one line per doc: 'slug — title [type]'. Use this to see what knowledge exists, then search_knowledge or read_knowledge for detail.",
  {
    type: z.enum(["guide", "concept", "article", "reference"]).optional()
      .describe("Restrict the listing to a single content type"),
  },
  async ({ type }) => {
    return withMetrics("list_knowledge", async () => {
      triggerRefreshOnRead(); // non-blocking; serves the current listing immediately
      if (!knowledgeLib) {
        return { content: [{ type: "text", text: "Knowledge module unavailable." }] };
      }
      const lines = knowledgeLib.listKnowledge({ type });
      if (!lines.length) {
        return { content: [{ type: "text", text: "No knowledge docs found." }] };
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    });
  }
);

/**
 * Startup self-heal: compare a manifest hash of the content dirs against the
 * indexed `docs` table. If the DB is missing/empty or has drifted (files added,
 * changed, or removed out-of-band — e.g. after a git pull), kick a background
 * reindex. Non-blocking: server init never waits on this.
 */
function startupSelfHeal() {
  if (!indexStore || !reindexLib) return;
  (async () => {
    try {
      const store = getStore();
      if (!store) return;

      // Hash the docs table the same way manifestHash() hashes the disk:
      // sorted `path:content_hash` lines → sha256.
      const crypto = require("crypto");
      const rows = store.db.prepare("SELECT path, content_hash FROM docs").all();
      const dbHash = crypto
        .createHash("sha256")
        .update(rows.map((r) => `${r.path}:${r.content_hash}`).sort().join("\n"))
        .digest("hex");
      const diskHash = reindexLib.manifestHash(CONTENT_DIRS);

      if (dbHash === diskHash) return; // index already matches the markdown

      console.error("[alexandria] index drift detected — rebuilding in background…");
      const r = await reindexLib.reindexAll(store, { contentDirs: CONTENT_DIRS });
      console.error(`[alexandria] background reindex done: ${r.docs} docs, ${r.chunksEmbedded} chunks, ${r.skipped} skipped.`);
    } catch (err) {
      console.error(`[alexandria] startup self-heal failed (lexical fallback remains): ${err.message}`);
    }
  })();
}

// Start the server
try { guidesTotal.set(getGuideFiles().length); } catch (_) {}
// Initialize the refresh-on-read TTL clock: the startup self-heal already
// reconciles against the markdown source-of-record, so treat boot as a fresh
// sync and let the TTL elapse before the first background refresh-on-read.
if (refreshLib) { try { refreshLib.setLastSyncOk(Date.now()); } catch (_) {} }
startupSelfHeal(); // fire-and-forget; does not block server.connect
const transport = new StdioServerTransport();
await server.connect(transport);
