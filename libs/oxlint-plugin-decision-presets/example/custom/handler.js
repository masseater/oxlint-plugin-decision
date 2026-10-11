import { db } from "../deps.js";

export async function getOrders(request, response) {
  const orders = await db.query(`SELECT * FROM orders WHERE user_id = ${request.params.id}`);
  response.json(orders);
}
