import { listPublicReviews } from "@/lib/reviews";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await listPublicReviews(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Public reviews error", error);
    return Response.json({ reviews: [], count: 0, average: 0, error: "Reseñas temporalmente no disponibles" }, { status: 503 });
  }
}