import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getStripe } from '@/lib/stripe';
import { hasFullIdentityReport } from '@/lib/entitlements';

// #162: Checkout for the $19 Identity report unlock. The buyer comes from the
// signed-in session, never the request body. The product goes into the
// session metadata, where the webhook and verify-checkout read what to grant.
// The $49 Adventurer checkout (app/api/checkout) is separate and unchanged.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const priceId = process.env.STRIPE_IDENTITY_PRICE_ID;
  if (!priceId) {
    console.error('identity-checkout: STRIPE_IDENTITY_PRICE_ID is not set');
    return NextResponse.json({ error: 'Identity checkout is not configured' }, { status: 500 });
  }

  if (await hasFullIdentityReport(user.id)) {
    return NextResponse.json({ error: 'Your full report is already unlocked' }, { status: 409 });
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/identity?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/identity`,
      metadata: { user_id: user.id, product: 'identity_unlock' },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Identity checkout session creation failed:', error);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
