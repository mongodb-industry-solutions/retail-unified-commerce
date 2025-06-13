import { NextResponse } from "next/server";
import { clientPromise, dbName} from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request) {
    const { 
        filter={}, 
        projection ={},
        options={}, 
        databaseName = dbName, 
        collectionName 
    } = await request.json();
    const client = await clientPromise
    const db = client.db(databaseName);
    const collection = db.collection(collectionName);

    if(filter['_id']){
        filter['_id'] = new ObjectId(filter['_id'])
    }

    const result = await collection
        .find(filter, {projection, ...options} )
        .toArray()
    console.log('-- result: ', result)
    
    return NextResponse.json({ result:result || null }, { status: 200 });
}