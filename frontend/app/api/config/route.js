export async function GET() {
  return Response.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
  });
}
