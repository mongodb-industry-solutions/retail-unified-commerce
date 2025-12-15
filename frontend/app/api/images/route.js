// app/api/get-image/route.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

// S3 client will automatically use AWS SSO credentials
const s3Client = new S3Client({ region: "us-east-1" });

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const command = new GetObjectCommand({
      Bucket: "retail-unified-commerce",
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 min
    console.log("Generated signed URL:", url);
    return NextResponse.json({ url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate signed URL" }, { status: 500 });
  }
}
