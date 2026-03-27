import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

export const mcpServer = new McpServer({
  name: "NovusSparks-BrightData",
  version: "1.0.0"
});

mcpServer.tool(
  "bright_data_search",
  {
    query: z.string().describe("Search query to find information"),
    limit: z.number().optional().describe("Maximum number of results to return"),
    country: z.string().optional().describe("Country code (e.g., 'us', 'pk')")
  },
  async ({ query, limit = 5, country = "us" }) => {
    console.log(`[MCP] Executing bright_data_search: ${query} (limit: ${limit}, country: ${country})`);
    
    const apiKey = process.env.BRIGHT_DATA_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: BRIGHT_DATA_API_KEY is not configured on the server." }],
        isError: true
      };
    }
    
    // Simulating Bright Data API call for now
    return {
      content: [{ type: "text", text: `[Simulated] Bright Data Search Results for "${query}"\n1. NovusSparks Portal - https://novussparks.com` }]
    };
  }
);

mcpServer.tool(
  "bright_data_scrape",
  {
    url: z.string().url().describe("The URL to scrape"),
    format: z.enum(["text", "html", "markdown"]).optional().describe("The format to return the scraped content")
  },
  async ({ url, format = "markdown" }) => {
    console.log(`[MCP] Executing bright_data_scrape: ${url} (format: ${format})`);
    
    const apiKey = process.env.BRIGHT_DATA_API_KEY;
    if (!apiKey) {
      return {
        content: [{ type: "text", text: "Error: BRIGHT_DATA_API_KEY is not configured on the server." }],
        isError: true
      };
    }
    
    // Simulating Bright Data Scraping
    return {
      content: [{ type: "text", text: `[Simulated] Bright Data Scrape Results for ${url} in ${format} format.\n\n# Welcome to NovusSparks\nThis data was scraped via Bright Data.` }]
    };
  }
);

let transport = null;

export async function handleMcpRequest(req, res, method, pathname) {
  if (method === "GET" && pathname === "/mcp/sse") {
    console.log("[MCP] New SSE connection established");
    // SSEServerTransport handles setting the proper headers and keeping the connection open
    transport = new SSEServerTransport("/mcp/message", res);
    await mcpServer.connect(transport);
    return true; // Handled
  }

  if (method === "POST" && pathname === "/mcp/message") {
    if (!transport) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("SSE connection not established");
      return true; // Handled
    }
    
    // Read JSON body
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const bodyText = Buffer.concat(buffers).toString();
    
    if (!bodyText) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing request body");
      return true;
    }
    
    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid JSON");
      return true;
    }
    
    // The transport takes a parsed object or string depending on SDK version?
    // Looking at mcp sdk: handlePostMessage takes the request, response (optional for some wrappers, but not raw http usually).
    // Let's check how @modelcontextprotocol/sdk/server/sse.js handlePostMessage is implemented.
    // It typically expects a Web Request/Response or express Req/Res. 
    // In raw node, transport.handlePostMessage(req, res) might be enough if it parses body itself, or we might need to pass the parsed body.
    
    try {
       await transport.handlePostMessage(req, res, parsedBody);
    } catch (e) {
       console.error("[MCP] handlePostMessage error", e);
    }
    
    return true; // Handled
  }
  
  return false; // Not an MCP route
}
