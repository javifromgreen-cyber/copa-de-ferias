export type PaymentMethod = "card" | "bizum" | "klarna" | "paypal";

export type ChargeRequest = {
  bookingReference: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  buyerEmail: string;
  description: string;
};

export type ChargeResult = {
  success: boolean;
  providerReference: string;
  isSimulated: boolean;
  raw?: unknown;
};

/**
 * Every payment provider (demo, Stripe, PayPal) implements this interface.
 * The booking flow never talks to Stripe/PayPal SDKs directly — only
 * through this abstraction — so swapping providers never touches UI code.
 */
export interface PaymentProvider {
  readonly kind: "demo" | "stripe" | "paypal";
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
