import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function hasPaidEntitlement(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('entitlements')
    .select('id')
    .eq('user_id', userId)
    .eq('product', 'onetime_payment')
    .eq('status', 'active')
    .maybeSingle();
  return !!data;
}

export async function grantEntitlement(
  userId: string,
  source: 'stripe' | 'manual'
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('entitlements')
    .upsert(
      { user_id: userId, product: 'onetime_payment', status: 'active', source },
      { onConflict: 'user_id,product' }
    );
}
