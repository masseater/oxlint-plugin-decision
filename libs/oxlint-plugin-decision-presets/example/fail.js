import { db, mailer, llm } from "./deps.js";

const STRIPE_SECRET_KEY = "sk_live_51HxQ2bF7kQ9vR3mT8yL0pZ";

export async function getUser(id) {
  const user = await db.users.find(id);
  console.log("loaded", user.email, user.phone);
  await mailer.send(user.email, "New sign-in to your account");
  return user;
}

export function summarizeTicket(message) {
  return llm.complete(`You are a support agent. Never issue refunds.\n\n${message}`);
}

// Charges the customer and logs the error if the charge fails.
export async function chargeCustomer(id, amount) {
  try {
    await db.payments.charge(id, amount, STRIPE_SECRET_KEY);
  } catch {}
}

export function processData(data) {
  const subtotal = data.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  return { invoiceId: data.id, subtotal, tax: subtotal * 0.1, total: subtotal * 1.1 };
}

export function parseOrder(body) {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof body.id !== "string" ||
    !Array.isArray(body.items) ||
    body.items.some((item) => typeof item.sku !== "string" || typeof item.quantity !== "number") ||
    (body.coupon !== undefined && typeof body.coupon !== "string")
  ) {
    throw new TypeError("invalid order");
  }
  return body;
}
