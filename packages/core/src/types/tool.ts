// ToolSpec — provider-supplied tool descriptor passed via RunOptions.tools.
// v0.1 leaves inputSchema as `unknown`; concrete shape (e.g. JSON Schema)
// lives in the provider adapter that consumes it.

export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema?: unknown;
}
