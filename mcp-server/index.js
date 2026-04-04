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

// Tool: List all available guides
server.tool(
  "list_guides",
  "List all available tooling setup guides in Project Alexandria",
  {},
  async () => {
    const guides = getGuideFiles();
    if (guides.length === 0) {
      return { content: [{ type: "text", text: "No guides found." }] };
    }
    const list = guides.map(g => {
      const content = readGuide(g.filename);
      // Extract first heading as title
      const titleMatch = content?.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : g.name;
      // Extract overview section
      const overviewMatch = content?.match(/## Overview\s*\n\s*\n(.+?)(?:\n\s*\n)/s);
      const overview = overviewMatch ? overviewMatch[1].trim().slice(0, 150) : "";
      return `- **${title}** (${g.filename})${overview ? `\n  ${overview}` : ""}`;
    }).join("\n\n");
    return { content: [{ type: "text", text: `# Available Guides\n\n${list}` }] };
  }
);

// Tool: Read a specific guide
server.tool(
  "read_guide",
  "Read the full content of a specific tooling setup guide",
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

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
