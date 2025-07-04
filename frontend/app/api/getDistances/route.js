import { clientPromise } from "@/lib/mongodb";
import { NextResponse } from "next/server";
const { ObjectId } = require('mongodb');

export async function POST(request) {
    try {
        let {
            collectionName,
            mainPoint,
        } = await request.json();
        console.log(mainPoint, 'mainPoint');
        const client = await clientPromise
        const db = client.db(process.env.DB_NAME);
        const collection = db.collection(collectionName);
        
        const distances = await collection.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: mainPoint }, // Reference point  
                    distanceField: "distance", 
                    spherical: true,             // Use spherical calculations for Earth  
                }
            },
            {
                $project: {
                    _id: 1,
                    storeName: 1,                      // Keep name field  
                    location: 1,                  // Keep location field  
                    distanceInKM: { $divide: ["$distance", 1000] }, // Convert distance from meters to kilometers
                    isNearby: { $lt: [{ $divide: ["$distance", 1000] }, 15] } // Check if distance is less than 15 km
                }
            }
        ])
        .toArray();

        console.log('Distances:', distances);
        return NextResponse.json({ distances: distances }, { status: 200 });
    } catch (error) {
        console.error('Error creating order:', error);
        return new Response('Error creating order', { status: 500 });
    } finally {
        //await closeDatabase (); // Close the MongoDB client connection
    }
}