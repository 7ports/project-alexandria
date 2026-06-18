import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '..', 'index.js');

describe('mcp-boot.integration', () => {
  let server = null;
  let stdout = '';
  let stderr = '';

  afterAll(() => {
    if (server) {
      server.kill('SIGTERM');
    }
  });

  it('boots the MCP server and advertises all 6 new tools', async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (server) server.kill();
        reject(new Error('MCP server boot test timed out'));
      }, 30_000); // 30s timeout

      server = spawn('node', [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });

      let responseCount = 0;
      const responses = [];

      // Collect stdout
      server.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        try {
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              const json = JSON.parse(line);
              responses.push(json);
              responseCount += 1;

              // We expect at least two responses: initialize and tools/list
              if (responseCount >= 2) {
                clearTimeout(timeout);
                validateResponses(responses, resolve, reject);
                if (server) server.kill();
              }
            }
          }
        } catch (_) {
          // JSON parse error — ignore, accumulate more data
        }
      });

      server.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      server.on('close', (code) => {
        if (code !== null && code !== 0 && code !== 143) { // 143 = SIGTERM
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}. stderr: ${stderr}`));
        }
      });

      // Send initialize request
      const initReq = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      };
      server.stdin.write(JSON.stringify(initReq) + '\n');

      // Send tools/list request (after a small delay to ensure init completes)
      setTimeout(() => {
        const toolsReq = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        };
        server.stdin.write(JSON.stringify(toolsReq) + '\n');
      }, 500);
    });
  }, { timeout: 35_000 });
});

function validateResponses(responses, resolve, reject) {
  try {
    // Find the tools/list response
    const toolsResponse = responses.find((r) => r.result && r.result.tools);

    if (!toolsResponse) {
      reject(new Error('No tools/list response found in server output'));
      return;
    }

    const tools = toolsResponse.result.tools || [];
    const toolNames = tools.map((t) => t.name);

    // The 6 new semantic/vector tools must be present
    const requiredTools = [
      'search_knowledge',
      'recall_context',
      'read_knowledge',
      'write_knowledge',
      'list_knowledge',
      'reindex_knowledge',
    ];

    for (const toolName of requiredTools) {
      if (!toolNames.includes(toolName)) {
        reject(
          new Error(
            `Tool '${toolName}' not advertised. Available: ${toolNames.join(', ')}`
          )
        );
        return;
      }
    }

    // Verify each tool has a description
    for (const toolName of requiredTools) {
      const tool = tools.find((t) => t.name === toolName);
      if (!tool.description || tool.description.trim().length === 0) {
        reject(
          new Error(
            `Tool '${toolName}' has no description`
          )
        );
        return;
      }
    }

    resolve();
  } catch (err) {
    reject(err);
  }
}
