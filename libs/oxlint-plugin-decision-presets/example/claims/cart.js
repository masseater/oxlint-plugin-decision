const carts = new Map();

/** Returns the cart, or null when no cart has this id. It never throws. */
export function getCart(id) {
  const cart = carts.get(id);
  if (!cart) throw new Error(`no cart ${id}`);
  return cart;
}

export function isEmpty(cart) {
  return cart.items.length === 0 ? "empty" : "has items";
}

export function subtotal(cart) {
  return cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function applyDiscount(cart, percent) {
  const total = subtotal(cart) * (1 - percent / 100);
  carts.set(cart.id, { ...cart, coupon: `${percent}%` });
  return total;
}

export function removeItem(cart, sku) {
  return { ...cart, items: cart.items.filter((item) => item.sku !== sku) };
}

export function computeTotal(cart) {
  const total = subtotal(cart);
  console.log("total", total);
  return total;
}

export function safeParse(text) {
  return JSON.parse(text);
}

export function registerHandler(handlers, handler) {
  handlers.push(handler);
}

export async function saveCart(db, cart) {
  try {
    await db.put(cart.id, cart);
    console.info("cart saved", cart.id);
  } catch (error) {
    console.debug("cart saved", error);
  }
}
