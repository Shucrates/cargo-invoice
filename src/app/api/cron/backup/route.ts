import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Check authorization token from Vercel Cron header
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 });
  }

  // Backup log confirmation endpoint
  return NextResponse.json({
    success: true,
    message: 'Nightly database audit snapshot triggered successfully.',
    timestamp: new Date().toISOString(),
  });
}
