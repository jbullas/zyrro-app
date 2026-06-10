import { createClient } from '@supabase/supabase-js';

export type EntitlementProduct = 'onetime_payment' | 'subscription_payment';

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function hasEntitlement(userId: string, product: EntitlementProduct): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('product', product)
    .eq('status', 'active')
    .maybeSingle();
  return !!data;
}

export async function hasPaidEntitlement(userId: string): Promise<boolean> {
  return hasEntitlement(userId, 'onetime_payment');
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
