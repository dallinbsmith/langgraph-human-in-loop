import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // Track pending tool calls that need approval
  pendingApproval: Annotation<{
    toolName: string;
    toolArgs: Record<string, unknown>;
    toolCallId: string;
  } | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  // Human's decision on pending approval
  approvalDecision: Annotation<"approved" | "denied" | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
