import { getSupabaseServiceRole } from "@/lib/admin-route-auth";
import { searchSquarePaymentByOrderId, deleteSquarePaymentLink, readSquareOrderState, createSquarePaymentLink, getAppUrl, getSquareLocationId } from "@/lib/square";

export type TrainerCheckout = { id: string; user_id: string; trainer_id: string; status: string; session_name: string; session_cents: number; venue_fee_cents: number; square_order_id: string | null; square_payment_link_id: string | null; checkout_url: string | null; customer: { email: string } };

export async function trainerPaymentLink(draft: TrainerCheckout) {
  if (draft.checkout_url && draft.square_order_id && draft.square_payment_link_id) return { url: draft.checkout_url, order_id: draft.square_order_id, id: draft.square_payment_link_id };
  const result = await createSquarePaymentLink({ idempotency_key: draft.id, order: { location_id: getSquareLocationId(), reference_id: draft.id, line_items: [{ name: draft.session_name, quantity: "1", base_price_money: { amount: draft.session_cents, currency: "USD" } }, ...(draft.venue_fee_cents > 0 ? [{ name: "Training venue fee", quantity: "1", base_price_money: { amount: draft.venue_fee_cents, currency: "USD" } }] : [])] }, checkout_options: { redirect_url: `${getAppUrl()}/trainers/confirmation?id=${draft.id}`, ask_for_shipping_address: false, allow_tipping: false }, pre_populated_data: { buyer_email: draft.customer.email } });
  const link = result.payment_link;
  if (!link?.url || !link.order_id || !link.id) throw new Error("Could not create payment link.");
  const saved = await getSupabaseServiceRole()!.from("trainer_checkouts").update({ square_order_id: link.order_id, square_payment_link_id: link.id, checkout_url: link.url }).eq("id", draft.id);
  if (saved.error) throw new Error("Could not save checkout link.");
  return { url: link.url, order_id: link.order_id, id: link.id };
}

export async function cancelTrainerCheckout(draft: TrainerCheckout) {
  if (draft.status !== "pending") return;
  // Recover an ambiguous link-creation result with the original idempotency key.
  const link = await trainerPaymentLink(draft);
  await confirmTrainerCheckout(link.order_id);
  const db = getSupabaseServiceRole()!;
  const { data: current } = await db.from("trainer_checkouts").select("status").eq("id", draft.id).single();
  if (current?.status === "paid") throw new Error("This session is paid and cannot be released as an unpaid hold.");
  await deleteSquarePaymentLink(link.id);
  if (await readSquareOrderState(link.order_id) !== "CANCELED") throw new Error("Checkout has not been cancelled by Square. The time remains held.");
  const { error } = await db.rpc("cancel_trainer_checkout", { p_id: draft.id });
  if (error) throw new Error("Could not release the held time.");
}

export async function releaseExpiredTrainerCheckouts(trainerId: string) {
  const db = getSupabaseServiceRole();
  if (!db) return;
  const { data } = await db.from("trainer_checkouts").select("*").eq("trainer_id", trainerId).eq("status", "pending").lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).limit(10);
  for (const draft of data ?? []) {
    try { await cancelTrainerCheckout(draft as TrainerCheckout); } catch { /* Keep the hold when payment state is uncertain. */ }
  }
}

export async function confirmTrainerCheckout(orderId: string) {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Service unavailable.");
  const { data: draft, error } = await db.from("trainer_checkouts").select("id,status,total_cents,currency").eq("square_order_id", orderId).maybeSingle();
  if (error) throw new Error("Could not load trainer checkout.");
  if (!draft) return false;
  if (draft.status === "paid") return true;
  const payment = await searchSquarePaymentByOrderId(orderId);
  if (payment?.status !== "COMPLETED" || !payment.id) return true;
  // Read the authoritative payment, including amount, before confirming the booking.
  const { readSquarePayment } = await import("@/lib/square");
  const verified = await readSquarePayment(payment.id);
  if (verified.status !== "COMPLETED" || verified.order_id !== orderId || verified.amount_money?.amount !== draft.total_cents || verified.amount_money?.currency !== draft.currency) throw new Error("Trainer payment total does not match checkout.");
  const result = await db.rpc("confirm_trainer_checkout", { p_checkout_id: draft.id, p_payment_id: payment.id });
  if (result.error) throw new Error("Could not confirm trainer booking.");
  return true;
}
