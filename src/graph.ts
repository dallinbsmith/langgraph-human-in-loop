import { StateGraph, END, MemorySaver, interrupt } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentStateType } from "./state.js";
import { allTools, safeTools, sensitiveToolNames } from "./tools.js";

const model = new ChatAnthropic({
  modelName: "claude-sonnet-4-20250514",
  temperature: 0,
}).bindTools(allTools);

const SYSTEM_PROMPT = `You are a helpful customer service agent. You can:
- Look up customers and their appointments
- Check availability
- Cancel appointments (requires manager approval)
- Process refunds (requires manager approval)
- Reschedule appointments (requires manager approval)
- Apply discounts (requires manager approval for >10%)

Be helpful and professional. When a customer requests something that requires approval,
proceed with the tool call - the system will handle getting manager approval.`;

// NODE: Agent reasoning
const callModel = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  const messages = [{ role: "system" as const, content: SYSTEM_PROMPT }, ...state.messages];
  const response = await model.invoke(messages);
  return { messages: [response] };
};

// NODE: Execute safe tools only
const safeToolNode = new ToolNode(safeTools);

// NODE: Execute sensitive tools (after approval)
const sensitiveToolNode = new ToolNode(allTools);

// NODE: Check if sensitive tool needs approval, interrupt if so
const checkApproval = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
    return {};
  }

  // Find the first sensitive tool call
  const sensitiveCall = lastMessage.tool_calls.find((tc) =>
    sensitiveToolNames.includes(tc.name)
  );

  if (!sensitiveCall) {
    return {};
  }

  // Store pending approval info
  console.log("\n⚠️  SENSITIVE ACTION DETECTED");
  console.log(`   Tool: ${sensitiveCall.name}`);
  console.log(`   Args: ${JSON.stringify(sensitiveCall.args, null, 2)}`);

  // Interrupt and wait for human decision
  const decision = interrupt({
    question: `Approve ${sensitiveCall.name}?`,
    toolName: sensitiveCall.name,
    toolArgs: sensitiveCall.args,
  });

  return {
    pendingApproval: {
      toolName: sensitiveCall.name,
      toolArgs: sensitiveCall.args as Record<string, unknown>,
      toolCallId: sensitiveCall.id || "",
    },
    approvalDecision: decision as "approved" | "denied",
  };
};

// NODE: Handle denied approval
const handleDenied = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
    return {};
  }

  // Find sensitive tool calls and create denial messages
  const denialMessages = lastMessage.tool_calls
    .filter((tc) => sensitiveToolNames.includes(tc.name))
    .map(
      (tc) =>
        new ToolMessage({
          tool_call_id: tc.id || "",
          name: tc.name,
          content: `❌ Action denied by manager. The ${tc.name} operation was not approved. Please inform the customer that their request requires additional review or cannot be completed at this time.`,
        })
    );

  return {
    messages: denialMessages,
    pendingApproval: null,
    approvalDecision: null,
  };
};

// ROUTING: After agent, determine what kind of tools to execute
const routeAfterAgent = (state: AgentStateType): string => {
  const lastMessage = state.messages[state.messages.length - 1];

  if (!(lastMessage instanceof AIMessage) || !lastMessage.tool_calls?.length) {
    return END;
  }

  // Check if any tool calls are sensitive
  const hasSensitive = lastMessage.tool_calls.some((tc) =>
    sensitiveToolNames.includes(tc.name)
  );

  if (hasSensitive) {
    return "check_approval";
  }

  return "safe_tools";
};

// ROUTING: After approval check, execute or deny
const routeAfterApproval = (state: AgentStateType): string => {
  if (state.approvalDecision === "approved") {
    return "sensitive_tools";
  }
  return "handle_denied";
};

export const checkpointer = new MemorySaver();

export const createAgentGraph = () => {
  const graph = new StateGraph(AgentState)
    .addNode("agent", callModel)
    .addNode("safe_tools", safeToolNode)
    .addNode("check_approval", checkApproval)
    .addNode("sensitive_tools", sensitiveToolNode)
    .addNode("handle_denied", handleDenied)

    .addEdge("__start__", "agent")

    // After agent: route based on tool type
    .addConditionalEdges("agent", routeAfterAgent, {
      safe_tools: "safe_tools",
      check_approval: "check_approval",
      [END]: END,
    })

    // Safe tools loop back to agent
    .addEdge("safe_tools", "agent")

    // After approval check: execute or deny
    .addConditionalEdges("check_approval", routeAfterApproval, {
      sensitive_tools: "sensitive_tools",
      handle_denied: "handle_denied",
    })

    // Both paths loop back to agent
    .addEdge("sensitive_tools", "agent")
    .addEdge("handle_denied", "agent");

  return graph.compile({ checkpointer });
};

/*
HUMAN-IN-THE-LOOP FLOW:

  START → agent → [tool type?]
                      │
          ┌───────────┼───────────┐
          │           │           │
      safe_tools  check_approval  END
          │           │
          │     [interrupt]
          │       ↓ human decision
          │     [approved?]
          │      │        │
          │   approved  denied
          │      ↓        ↓
          │  sensitive  handle_denied
          │   _tools        │
          │      │          │
          └──────┴────┬─────┘
                      ↓
                    agent (loop)
*/

export const graph = createAgentGraph();
