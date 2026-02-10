import "dotenv/config";
import { graph } from "./graph.js";
import { Command } from "@langchain/langgraph";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

const displayMessages = (messages: any[], startFrom = 0) => {
  for (let i = startFrom; i < messages.length; i++) {
    const msg = messages[i];

    if (msg instanceof AIMessage) {
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          console.log(`\n🔧 Calling: ${tc.name}`);
          console.log(`   Args: ${JSON.stringify(tc.args)}`);
        }
      }
      if (msg.content && (!msg.tool_calls || msg.tool_calls.length === 0)) {
        console.log(`\n🤖 Agent: ${msg.content}`);
      }
    } else if (msg instanceof ToolMessage) {
      const lines = (typeof msg.content === "string" ? msg.content : "").split("\n");
      console.log(`\n📋 ${msg.name} result:`);
      for (const line of lines) {
        console.log(`   ${line}`);
      }
    }
  }
};

const runInteractive = async () => {
  console.log("═".repeat(50));
  console.log("🛡️  Human-in-the-Loop Agent");
  console.log("═".repeat(50));
  console.log("\nSensitive actions require manager approval:");
  console.log("  • Cancellations");
  console.log("  • Refunds");
  console.log("  • Rescheduling");
  console.log("  • Discounts");
  console.log("\nType 'quit' to exit.\n");

  const threadId = `session-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  let messageCount = 0;

  while (true) {
    const userInput = await prompt("👤 Customer: ");

    if (userInput.toLowerCase() === "quit") {
      console.log("\nGoodbye!");
      break;
    }

    console.log("\n⏳ Processing...");

    try {
      let result = await graph.invoke(
        { messages: [new HumanMessage(userInput)] },
        config
      );

      // Check if we hit an interrupt (approval needed)
      const snapshot = await graph.getState(config);

      while (snapshot.next && snapshot.next.length > 0) {
        // We're interrupted - need approval
        const interruptValue = snapshot.tasks?.[0]?.interrupts?.[0]?.value as {
          question: string;
          toolName: string;
          toolArgs: Record<string, unknown>;
        } | undefined;

        if (interruptValue) {
          console.log("\n" + "═".repeat(50));
          console.log("🛑 MANAGER APPROVAL REQUIRED");
          console.log("═".repeat(50));
          console.log(`\nAction: ${interruptValue.toolName}`);
          console.log(`Details: ${JSON.stringify(interruptValue.toolArgs, null, 2)}`);

          const decision = await prompt("\n👔 Manager - Approve? (yes/no): ");
          const approved = decision.toLowerCase().startsWith("y") ? "approved" : "denied";

          console.log(`\n${approved === "approved" ? "✅ Approved" : "❌ Denied"}`);
          console.log("\n⏳ Continuing...");

          // Resume with the decision
          result = await graph.invoke(
            new Command({ resume: approved }),
            config
          );

          // Check for more interrupts
          const newSnapshot = await graph.getState(config);
          if (!newSnapshot.next || newSnapshot.next.length === 0) {
            break;
          }
        } else {
          break;
        }
      }

      // Display new messages
      displayMessages(result.messages, messageCount);
      messageCount = result.messages.length;
    } catch (error) {
      console.error("\nError:", error);
    }
  }

  rl.close();
};

// Demo with approval
const runApprovalDemo = async () => {
  console.log("═".repeat(50));
  console.log("📋 Demo: Cancellation with Approval");
  console.log("═".repeat(50));

  const threadId = `demo-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log('\n👤 Customer: "I need to cancel Sarah Johnson\'s appointment"');

  let result = await graph.invoke(
    { messages: [new HumanMessage("I need to cancel Sarah Johnson's appointment. Her phone is 555-123-4567.")] },
    config
  );

  displayMessages(result.messages);

  // Check for interrupt
  const snapshot = await graph.getState(config);
  if (snapshot.next && snapshot.next.length > 0) {
    console.log("\n" + "═".repeat(50));
    console.log("🛑 MANAGER APPROVAL REQUIRED");
    console.log("═".repeat(50));

    const interruptValue = snapshot.tasks?.[0]?.interrupts?.[0]?.value as any;
    if (interruptValue) {
      console.log(`\nAction: ${interruptValue.toolName}`);
      console.log(`Details: ${JSON.stringify(interruptValue.toolArgs, null, 2)}`);
    }

    console.log("\n👔 Manager: Approving...");

    result = await graph.invoke(
      new Command({ resume: "approved" }),
      config
    );

    displayMessages(result.messages, result.messages.length - 3);
  }
};

// Demo with denial
const runDenialDemo = async () => {
  console.log("\n" + "═".repeat(50));
  console.log("📋 Demo: Refund Denied");
  console.log("═".repeat(50));

  const threadId = `demo-denial-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log('\n👤 Customer: "I want a $100 refund for Mike Chen"');

  let result = await graph.invoke(
    { messages: [new HumanMessage("I want a $100 refund for Mike Chen, customer C002. The service was terrible.")] },
    config
  );

  displayMessages(result.messages);

  const snapshot = await graph.getState(config);
  if (snapshot.next && snapshot.next.length > 0) {
    console.log("\n" + "═".repeat(50));
    console.log("🛑 MANAGER APPROVAL REQUIRED");
    console.log("═".repeat(50));

    const interruptValue = snapshot.tasks?.[0]?.interrupts?.[0]?.value as any;
    if (interruptValue) {
      console.log(`\nAction: ${interruptValue.toolName}`);
      console.log(`Details: ${JSON.stringify(interruptValue.toolArgs, null, 2)}`);
    }

    console.log("\n👔 Manager: Denying - amount too high without investigation");

    result = await graph.invoke(
      new Command({ resume: "denied" }),
      config
    );

    displayMessages(result.messages, result.messages.length - 3);
  }
};

const main = async () => {
  const mode = process.argv[2] || "interactive";

  switch (mode) {
    case "demo":
      await runApprovalDemo();
      await runDenialDemo();
      break;
    case "interactive":
    default:
      await runInteractive();
      break;
  }
};

main().catch(console.error);
