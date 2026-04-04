#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";

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

const server = new McpServer({
  name: "alexandria",
  version: "1.0.0",
});

// Tool: List all available guides (compact — one line per guide)
server.tool(
  "list_guides",
  "List all available tooling setup guides. Returns one line per guide (name + title). Use this first to see what exists, then read_guide or quick_setup for details.",
  {},
  async () => {
    const guides = getGuideFiles();
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
  }
);

// Tool: Quick setup — returns only actionable commands and config, no prose
server.tool(
  "quick_setup",
  "Get ONLY the actionable install commands, config snippets, and troubleshooting from a guide. Much cheaper than read_guide — use this when you already know what tool to install and just need the steps. Falls back to extracting code blocks if no Quick Reference section exists.",
  { name: z.string().describe("Guide name (e.g., 'coplay-mcp-server', 'beads')") },
  async ({ name }) => {
    const content = readGuide(name);
    if (!content) {
      const guides = getGuideFiles();
      return { content: [{ type: "text", text: `Guide '${name}' not found. Available: ${guides.map(g => g.name).join(", ")}` }] };
    }

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
  }
);

// Tool: Read a specific guide (full content — use quick_setup when possible)
server.tool(
  "read_guide",
  "Read the FULL content of a guide. Prefer quick_setup when you just need install steps. Use read_guide only when troubleshooting, learning about a tool for the first time, or when quick_setup didn't have enough detail.",
  { name: z.string().describe("Guide name (e.g., 'coplay-mcp-server', 'beads', 'git-mcp-server')") },
  async ({ name }) => {
    const content = readGuide(name);
    if (!content) {
      const guides = getGuideFiles();
      const available = guides.map(g => g.name).join(", ");
      return { content: [{ type: "text", text: `Guide '${name}' not found. Available guides: ${available}` }] };
    }
    return { content: [{ type: "text", text: content }] };
  }
);

// Tool: Search across all guides
server.tool(
  "search_guides",
  "Search for keywords across all tooling setup guides in Project Alexandria",
  { query: z.string().describe("Search term or phrase to find across all guides") },
  async ({ query }) => {
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
  }
);

// Tool: Update or create a guide
server.tool(
  "update_guide",
  "Update an existing guide or create a new one in Project Alexandria. Use this to keep documentation current as you learn new things about tool setup.",
  {
    name: z.string().describe("Guide name (e.g., 'my-new-tool'). Will create/overwrite guides/<name>.md"),
    content: z.string().describe("Full markdown content for the guide"),
  },
  async ({ name, content }) => {
    const filename = name.endsWith(".md") ? name : `${name}.md`;
    const filepath = path.join(GUIDES_DIR, filename);
    const existed = fs.existsSync(filepath);

    try {
      fs.mkdirSync(GUIDES_DIR, { recursive: true });
      fs.writeFileSync(filepath, content, "utf-8");
      return {
        content: [{
          type: "text",
          text: `Guide '${filename}' ${existed ? "updated" : "created"} successfully at ${filepath}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error writing guide: ${err.message}` }] };
    }
  }
);

// Tool: Get the guide template
server.tool(
  "get_guide_template",
  "Get the template for creating new tooling setup guides",
  {},
  async () => {
    const templatePath = path.join(TEMPLATES_DIR, "guide-template.md");
    try {
      const content = fs.readFileSync(templatePath, "utf-8");
      return { content: [{ type: "text", text: content }] };
    } catch {
      return { content: [{ type: "text", text: "Template not found." }] };
    }
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
  }
);

// Tool: Get onboarding instructions for a new Claude instance
server.tool(
  "get_onboarding",
  "Get the full onboarding payload for a Claude instance that has Alexandria installed. This returns the behavioral contract, memory templates, and configuration that every Claude instance should adopt to collaboratively maintain this shared knowledge base. Call this when first discovering Alexandria is available, or when setting up Alexandria on a new machine.",
  {},
  async () => {
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
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
