import { SessionRoom } from '@/components/SessionRoom';
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return <SessionRoom id={(await params).id} />;
}
