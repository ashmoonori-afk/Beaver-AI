// AgentEvent — append-only event row written by adapters and the runtime.
// v0.1 keeps the payload as `unknown`; downstream callers narrow it per `type`
// (e.g. 'agent.shell', 'agent.network', 'state.transition').

export interface AgentEvent {
  ts: string; // ISO 8601
  source: string; // agent id or 'orchestrator'
  type: string;
  payload?: unknown;
}
