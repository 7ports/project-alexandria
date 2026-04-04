# Fetch MCP Server

## Overview

Provides web content fetching capabilities via MCP. Allows AI assistants to retrieve and process content from URLs, converting HTML to readable text. Useful for reading documentation, checking web pages, and gathering information from the web.

## Prerequisites

- Python with `uvx` available (install via `pip install uv`)

## Installation

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "fetch": {
    "type": "stdio",
    "command": "uvx",
    "args": ["mcp-server-fetch"]
  }
}
```

## Capabilities

- Fetches content from any public URL
- Converts HTML to markdown for readability
- Handles redirects
- Supports various content types (HTML, JSON, plain text)

## Usage Notes

- Best for public, unauthenticated URLs
- HTML is automatically converted to markdown
- Large pages may be summarized
- HTTP URLs are auto-upgraded to HTTPS
- Results are cached for 15 minutes

## Limitations

- Cannot access authenticated/private pages (use specialized MCP servers for those)
- Very large pages may be truncated
- Some dynamic (JavaScript-rendered) content may not be captured
- Rate limiting from target sites may affect results

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Content is empty/truncated | Page may be JavaScript-rendered; try a different approach |
| Timeout errors | Target site may be slow; retry or check URL |
| "Connection refused" | URL may be incorrect or site may be down |

## References

- [mcp-server-fetch on PyPI](https://pypi.org/project/mcp-server-fetch/)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
