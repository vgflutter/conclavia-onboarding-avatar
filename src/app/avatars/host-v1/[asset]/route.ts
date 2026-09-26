import { hostAssetResponse } from '@conclavia/avatar-kit/server/assets';
export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  return hostAssetResponse((await params).asset, request);
}
export const HEAD = GET;
