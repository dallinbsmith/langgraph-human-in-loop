import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Mock data
const customers = [
  { id: "C001", name: "Sarah Johnson", phone: "555-123-4567", email: "sarah.j@email.com", balance: 0, tier: "gold", visits: 24 },
  { id: "C002", name: "Mike Chen", phone: "555-234-5678", email: "mike.chen@email.com", balance: 25, tier: "standard", visits: 3 },
  { id: "C003", name: "Emily Davis", phone: "555-345-6789", email: "emily.d@email.com", balance: 0, tier: "platinum", visits: 52 },
  { id: "C004", name: "James Rodriguez", phone: "555-456-7890", email: "j.rodriguez@email.com", balance: 45, tier: "standard", visits: 7 },
  { id: "C005", name: "Aisha Patel", phone: "555-567-8901", email: "aisha.p@email.com", balance: 0, tier: "gold", visits: 18 },
  { id: "C006", name: "Tom Bradley", phone: "555-678-9012", email: "tbradley@email.com", balance: 120, tier: "standard", visits: 1 },
];

const appointments = [
  { id: "A001", customerId: "C001", date: "2026-02-15", time: "10:00 AM", service: "haircut", price: 35, status: "confirmed" },
  { id: "A002", customerId: "C002", date: "2026-02-16", time: "2:00 PM", service: "coloring", price: 120, status: "confirmed" },
  { id: "A003", customerId: "C003", date: "2026-02-14", time: "11:00 AM", service: "styling", price: 45, status: "confirmed" },
  { id: "A004", customerId: "C004", date: "2026-02-17", time: "3:00 PM", service: "beard-trim", price: 20, status: "confirmed" },
  { id: "A005", customerId: "C005", date: "2026-02-18", time: "9:30 AM", service: "highlights", price: 150, status: "confirmed" },
  { id: "A006", customerId: "C001", date: "2026-02-22", time: "11:00 AM", service: "deep-conditioning", price: 55, status: "confirmed" },
];

const availableSlots = [
  { date: "2026-02-17", time: "9:00 AM", service: "haircut" },
  { date: "2026-02-17", time: "11:00 AM", service: "haircut" },
  { date: "2026-02-17", time: "2:00 PM", service: "coloring" },
  { date: "2026-02-18", time: "10:00 AM", service: "haircut" },
  { date: "2026-02-18", time: "1:00 PM", service: "styling" },
  { date: "2026-02-19", time: "9:00 AM", service: "highlights" },
  { date: "2026-02-19", time: "11:30 AM", service: "haircut" },
  { date: "2026-02-19", time: "3:00 PM", service: "beard-trim" },
  { date: "2026-02-20", time: "10:00 AM", service: "coloring" },
  { date: "2026-02-20", time: "2:00 PM", service: "deep-conditioning" },
];

// ============ SAFE TOOLS (No approval needed) ============

export const searchCustomers = tool(
  async ({ query }) => {
    const results = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.phone.includes(query)
    );

    if (results.length === 0) return "No customers found.";

    return results
      .map((c) => `ID: ${c.id} | ${c.name} | ${c.phone} | Tier: ${c.tier} | Visits: ${c.visits} | Balance: $${c.balance}`)
      .join("\n");
  },
  {
    name: "search_customers",
    description: "Search for customers by name or phone. SAFE - no approval needed.",
    schema: z.object({
      query: z.string().describe("Name or phone to search"),
    }),
  }
);

export const getAppointments = tool(
  async ({ customerId }) => {
    const results = appointments.filter((a) => a.customerId === customerId);

    if (results.length === 0) return "No appointments found for this customer.";

    return results
      .map((a) => `ID: ${a.id} | ${a.date} ${a.time} | ${a.service} ($${a.price}) | Status: ${a.status}`)
      .join("\n");
  },
  {
    name: "get_appointments",
    description: "Get all appointments for a customer. SAFE - no approval needed.",
    schema: z.object({
      customerId: z.string().describe("Customer ID"),
    }),
  }
);

export const checkAvailability = tool(
  async ({ date, service }) => {
    let slots = availableSlots;
    if (date) slots = slots.filter((s) => s.date === date);
    if (service) slots = slots.filter((s) => s.service === service);

    if (slots.length === 0) return "No available slots matching criteria.";

    return slots.map((s) => `${s.date} at ${s.time} - ${s.service}`).join("\n");
  },
  {
    name: "check_availability",
    description: "Check available appointment slots. SAFE - no approval needed.",
    schema: z.object({
      date: z.string().optional().describe("Date in YYYY-MM-DD format"),
      service: z.string().optional().describe("Service type"),
    }),
  }
);

// ============ SENSITIVE TOOLS (Require approval) ============

export const cancelAppointment = tool(
  async ({ appointmentId, waiveFee }) => {
    const apt = appointments.find((a) => a.id === appointmentId);
    if (!apt) return "Error: Appointment not found.";

    const customer = customers.find((c) => c.id === apt.customerId);
    const fee = waiveFee ? 0 : 25;

    apt.status = "cancelled";
    if (customer && fee > 0) {
      customer.balance += fee;
    }

    return `✅ Appointment ${appointmentId} cancelled.
Customer: ${customer?.name}
Original: ${apt.date} ${apt.time} - ${apt.service}
Cancellation fee: $${fee}${waiveFee ? " (waived)" : ""}
${fee > 0 ? `New balance due: $${customer?.balance}` : ""}`;
  },
  {
    name: "cancel_appointment",
    description: "Cancel an appointment. SENSITIVE - requires human approval. May charge $25 fee unless waived.",
    schema: z.object({
      appointmentId: z.string().describe("Appointment ID to cancel"),
      waiveFee: z.boolean().describe("Whether to waive the $25 cancellation fee"),
    }),
  }
);

export const processRefund = tool(
  async ({ customerId, amount, reason }) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return "Error: Customer not found.";

    if (customer.balance < amount) {
      customer.balance = 0;
    } else {
      customer.balance -= amount;
    }

    return `✅ Refund processed.
Customer: ${customer.name}
Amount: $${amount}
Reason: ${reason}
New balance: $${customer.balance}`;
  },
  {
    name: "process_refund",
    description: "Process a refund for a customer. SENSITIVE - requires human approval.",
    schema: z.object({
      customerId: z.string().describe("Customer ID"),
      amount: z.number().describe("Refund amount in dollars"),
      reason: z.string().describe("Reason for refund"),
    }),
  }
);

export const rescheduleAppointment = tool(
  async ({ appointmentId, newDate, newTime }) => {
    const apt = appointments.find((a) => a.id === appointmentId);
    if (!apt) return "Error: Appointment not found.";

    const customer = customers.find((c) => c.id === apt.customerId);
    const oldDate = apt.date;
    const oldTime = apt.time;

    apt.date = newDate;
    apt.time = newTime;

    return `✅ Appointment rescheduled.
Customer: ${customer?.name}
Service: ${apt.service}
From: ${oldDate} ${oldTime}
To: ${newDate} ${newTime}`;
  },
  {
    name: "reschedule_appointment",
    description: "Reschedule an existing appointment to a new date/time. SENSITIVE - requires human approval.",
    schema: z.object({
      appointmentId: z.string().describe("Appointment ID"),
      newDate: z.string().describe("New date in YYYY-MM-DD format"),
      newTime: z.string().describe("New time (e.g., '10:00 AM')"),
    }),
  }
);

export const applyDiscount = tool(
  async ({ customerId, discountPercent, reason }) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return "Error: Customer not found.";

    return `✅ Discount applied.
Customer: ${customer.name}
Discount: ${discountPercent}% off next service
Reason: ${reason}
Note: Discount code sent to ${customer.phone}`;
  },
  {
    name: "apply_discount",
    description: "Apply a discount to a customer's next visit. SENSITIVE - requires human approval for discounts over 10%.",
    schema: z.object({
      customerId: z.string().describe("Customer ID"),
      discountPercent: z.number().describe("Discount percentage"),
      reason: z.string().describe("Reason for discount"),
    }),
  }
);

// Tools that are always safe
export const safeTools = [searchCustomers, getAppointments, checkAvailability];

// Tools that require human approval
export const sensitiveTools = [cancelAppointment, processRefund, rescheduleAppointment, applyDiscount];

// All tools
export const allTools = [...safeTools, ...sensitiveTools];

// Tool names that require approval
export const sensitiveToolNames = sensitiveTools.map((t) => t.name);
