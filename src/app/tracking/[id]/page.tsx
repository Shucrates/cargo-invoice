import { redirect } from 'next/navigation';

export default async function TrackingIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cleanId = decodeURIComponent(id).trim().replace(/^#+\s*/, '');
  redirect(`/tracking?id=${encodeURIComponent(cleanId)}`);
}

