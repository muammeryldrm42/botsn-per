import { loadSnapshot } from "@/lib/loadSnapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { snapshot, source } = await loadSnapshot();
  const { safetyCache: _cache, ...publicSnapshot } = snapshot;
  void _cache;
  return Response.json(
    { source, ...publicSnapshot },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=120" } },
  );
}
