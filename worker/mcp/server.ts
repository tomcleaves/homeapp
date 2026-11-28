import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { inProcessApi } from "./api";
import { registerJobTools } from "./tools/jobs";
import { registerRecipeTools } from "./tools/recipes";

const INSTRUCTIONS = `The Weekly Table is Tom and Sophia's home app. These tools manage its recipe library and its house-jobs list (with parts to buy and a shopping list).
Ids come from the list tools. Money is in pounds. Dates are YYYY-MM-DD (UK). Edits are recorded as the signed-in user and show up in the app straight away.`;

/**
 * Serves one MCP request (stateless Streamable HTTP). The caller has already
 * checked sign-in; `fetchApi` runs the app's /api routes in-process.
 */
export function handleMcp(request: Request, fetchApi: (request: Request) => Response | Promise<Response>) {
  const api = inProcessApi(request, fetchApi);
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "homeapp-mcp-server", version: "1.0.0" }, { instructions: INSTRUCTIONS });
      registerRecipeTools(server, api);
      registerJobTools(server, api);
      return server;
    },
    { onerror: (e) => console.error("MCP error", e) },
  );
  return handler.fetch(request);
}
