import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeDockets = await prisma.cargoDocket.findMany({
      where: { status: 'issued' },
    });

    const voidedCount = await prisma.cargoDocket.count({
      where: { status: 'voided' },
    });

    const totalRevenue = activeDockets.reduce((sum, d) => sum + Number(d.grandTotal || 0), 0);
    const totalSubtotal = activeDockets.reduce((sum, d) => sum + Number(d.subtotal || 0), 0);
    const totalGST = activeDockets.reduce((sum, d) => sum + Number(d.gstAmount || 0), 0);
    const totalWeight = activeDockets.reduce((sum, d) => sum + Number(d.chargedWeightKg || 0), 0);

    const pendingCollection = activeDockets
      .filter((d) => d.paymentMode === 'To_Pay' || d.paymentMode === 'Credit')
      .reduce((sum, d) => sum + Number(d.grandTotal || 0), 0);

    return NextResponse.json({
      activeCount: activeDockets.length,
      voidedCount,
      totalRevenue,
      totalSubtotal,
      totalGST,
      totalWeight,
      pendingCollection,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
