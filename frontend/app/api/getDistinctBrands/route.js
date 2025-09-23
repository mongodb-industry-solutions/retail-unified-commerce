import { clientPromise, dbName } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    let {
      databaseName = dbName,
      collectionName,
    } = await request.json();

    const client = await clientPromise
    const db = client.db(databaseName);
    const collection = db.collection(collectionName);



    const pipeline = [
      {
        $group: {
          _id: "$brand",
          count: {
            $sum: 1
          },
          categories: { $addToSet: "$category" }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]

    let data = await collection.aggregate(pipeline).toArray();

    const mongoUri = process.env.MONGODB_URI || "";
    const deployment = mongoUri.includes(".mongodb.net") ? "atlas" : "enterprise";
    console.log('Deployment:', deployment);

    return NextResponse.json({
      data: data,
      deployment: deployment
    },
      {
        status: 200
      }
    );
  } catch (error) {
    console.error('Error getting search meta:', error);
    return new Response('Error getting search meta', { status: 500 });
  } finally {
    //await closeDatabase (); // Close the MongoDB client connection
  }
}