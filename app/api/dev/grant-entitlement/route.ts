import { NextRequest, NextResponse } from 'next/server';
import { grantEntitlement, type EntitlementProduct } from '@/lib/entitlements';

// DEV ONLY — remove before go-live
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const { user_id, product = 'onetime_payment' } = await req.json() as {
    user_id: string;
    product?: EntitlementProduct;
  };

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
  }

  const granted = await grantEntitlement(user_id, 'manual', product);
  return NextResponse.json({ granted });
}
