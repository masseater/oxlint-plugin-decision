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

export async function chargeCustomer(id, amount) {
  try {
    await db.payments.charge(id, amount, STRIPE_SECRET_KEY);
  } catch {}
}
