import { avatarAssetResponse } from '@conclavia/avatar-kit/server/assets';
export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  return avatarAssetResponse((await params).asset, request);
}
