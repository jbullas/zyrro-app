import { getStripe } from '@/lib/stripe';

// #162: the price on the Identity unlock button, read from the Stripe price
// object (STRIPE_IDENTITY_PRICE_ID) rather than typed into copy, so a new
// price needs only a new Stripe price, the env var swapped and a redeploy.
// Server-only. Cached per price id for the life of the server process;
// failures aren't cached, so a transient Stripe error retries next time.

const labels = new Map<string, string | null>();

export async function getIdentityPriceLabel(): Promise<string | null> {
  const priceId = process.env.STRIPE_IDENTITY_PRICE_ID;
  if (!priceId) return null;
  if (labels.has(priceId)) return labels.get(priceId)!;

  try {
    const price = await getStripe().prices.retrieve(priceId);
    const label = price.unit_amount == null ? null : formatPrice(price.unit_amount, price.currency);
    labels.set(priceId, label);
    return label;
  } catch (error) {
    console.error('getIdentityPriceLabel failed', { priceId, error });
    return null;
  }
}

// Stripe amounts are in the currency's minor unit; Intl knows how many
// decimals each currency has. Whole amounts drop the decimals ("$19").
function formatPrice(unitAmount: number, currency: string): string {
  const code = currency.toUpperCase();
  const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  const value = unitAmount / 10 ** digits;
  const fraction = Number.isInteger(value) ? 0 : digits;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(value);
}
