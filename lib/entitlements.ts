import { createClient } from '@supabase/supabase-js';
import { withDbRetry } from '@/lib/with-db-retry';

export type EntitlementProduct = 'onetime_payment' | 'subscription_payment' | 'identity_unlock';

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function hasEntitlement(userId: string, product: EntitlementProduct): Promise<boolean> {
  // NEVER set NEXT_PUBLIC_OPEN_ACCESS on the production environment.
  if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') return true;
  const supabase = createServiceClient();
  const { data, error } = await withDbRetry('hasEntitlement', () =>
    supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', userId)
      .eq('product', product)
      .eq('status', 'active')
      .maybeSingle()
  );
  if (error) {
    console.error('hasEntitlement error', { userId, product, error });
  }
  return !!data;
}

export async function hasPaidEntitlement(userId: string): Promise<boolean> {
  return hasEntitlement(userId, 'onetime_payment');
}

// #162: the full Identity report comes with either the $19 identity_unlock or
// the $49 onetime_payment. Both rows can exist, so limit(1) before maybeSingle().
export async function hasFullIdentityReport(userId: string): Promise<boolean> {
  // NEVER set NEXT_PUBLIC_OPEN_ACCESS on the production environment.
  if (process.env.NEXT_PUBLIC_OPEN_ACCESS === 'true') return true;
  const supabase = createServiceClient();
  const { data, error } = await withDbRetry('hasFullIdentityReport', () =>
    supabase
      .from('entitlements')
      .select('id')
      .eq('user_id', userId)
      .in('product', ['identity_unlock', 'onetime_payment'])
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
  );
  if (error) {
    console.error('hasFullIdentityReport error', { userId, error });
  }
  return !!data;
}

// #162: the product a completed Checkout Session pays for, from its metadata.
// Sessions without one are the $49 Adventurer checkout (it has never set a
// product), so they keep granting onetime_payment. Anything else is unknown:
// null, and the caller grants nothing.
export function checkoutProduct(metadata: Record<string, string> | null | undefined): EntitlementProduct | null {
  const product = metadata?.product;
  if (!product) return 'onetime_payment';
  return product === 'identity_unlock' || product === 'onetime_payment' ? product : null;
}

export async function grantEntitlement(
  userId: string,
  source: 'stripe' | 'manual',
  product: EntitlementProduct = 'onetime_payment'
): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('entitlements')
    .upsert(
      { user_id: userId, product, status: 'active', source },
      { onConflict: 'user_id,product' }
    );
  return !error;
}
