# LangGraph Human-in-the-Loop Agent

A LangGraph agent that automatically handles routine customer service requests but escalates sensitive actions for human approval before executing them.

## Why This Pattern Matters

Enterprise AI needs guardrails. This pattern lets you:
- Automate ~90% of requests with safe tools
- Escalate sensitive actions (refunds, cancellations) for human review
- Maintain an audit trail of approvals
- Gracefully handle denials without breaking the conversation

## How It Works

```
Customer Request
       ↓
     Agent
       ↓
  [Tool Type?]
    /      \
 Safe    Sensitive
   ↓         ↓
Execute   INTERRUPT
   ↓      (human decides)
   ↓        /    \
   ↓   Approve  Deny
   ↓      ↓       ↓
   ↓   Execute  Reject
   ↓      ↓       ↓
   └──────┴───────┘
          ↓
        Agent
      (respond)
```

## Tools

### Safe (No Approval Needed)
- `search_customers` - Look up customer by name/phone
- `get_appointments` - View customer's appointments
- `check_availability` - Check open slots

### Sensitive (Requires Approval)
- `cancel_appointment` - Cancel with optional $25 fee
- `process_refund` - Refund money to customer
- `reschedule_appointment` - Change appointment date/time
- `apply_discount` - Apply percentage discount

## Setup

```bash
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

## Run

```bash
# Interactive mode - you play both customer and manager
npm run dev

# Demo mode - automated approval/denial scenarios
npm run dev demo
```

## Example Session

```
👤 Customer: I want a refund for my last appointment

🔧 Calling: search_customers
🔧 Calling: process_refund

══════════════════════════════════════════════════
🛑 MANAGER APPROVAL REQUIRED
══════════════════════════════════════════════════
Action: process_refund
Details: { "customerId": "C001", "amount": 35, "reason": "..." }

👔 Manager - Approve? (yes/no): yes

✅ Approved

🤖 Agent: I've processed your refund of $35. You should see it
   reflected in your account within 3-5 business days.
```

## Key Concepts

### 1. Tool Classification
```typescript
const safeTools = [searchCustomers, getAppointments, checkAvailability];
const sensitiveTools = [cancelAppointment, processRefund, ...];
```

### 2. Interrupt Pattern
```typescript
// In the check_approval node:
const decision = interrupt({
  toolName: sensitiveCall.name,
  toolArgs: sensitiveCall.args,
});
```

### 3. Resume with Decision
```typescript
// After human decides:
await graph.invoke(
  new Command({ resume: "approved" }),  // or "denied"
  config
);
```

## Project Structure

```
src/
├── tools.ts    # Tool definitions (safe + sensitive)
├── state.ts    # State with approval tracking
├── graph.ts    # LangGraph with approval workflow
└── index.ts    # Interactive CLI runner
```

## License

MIT
