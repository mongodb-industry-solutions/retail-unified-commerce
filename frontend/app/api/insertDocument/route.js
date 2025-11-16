import { clientPromise, dbName } from "@/lib/mongodb";
import { NextResponse } from "next/server";
const { ObjectId } = require('mongodb');

export async function POST(request) {
    try {
        let {
            document={},
            databaseName = dbName,
            collectionName = process.env.COLLECTION_PRODUCTS || 'products'
        } = await request.json();

        // Validate collection name
        if (!collectionName) {
            return NextResponse.json({ error: 'Collection name is required' }, { status: 400 });
        }

        console.log(document)
        const client = await clientPromise
        const db = client.db(databaseName);
        const collection = db.collection(collectionName);
        document = {_id: new ObjectId(), ...document}
        await collection.insertOne(document);
    
        return NextResponse.json({ document: document }, { status: 200 });
    }  catch (error) {
        console.error('Error creating order:', error);
        return new Response('Error creating order', { status: 500 });
      } finally {
        //await closeDatabase (); // Close the MongoDB client connection
      }
}