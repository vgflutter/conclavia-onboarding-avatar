import { avatarAssetResponse } from '@conclavia/avatar-kit/server/assets';
export async function GET(_req: Request, { params }: { params: Promise<{ asset: string }> }) {
  return avatarAssetResponse((await params).asset);
}
