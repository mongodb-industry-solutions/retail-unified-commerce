import { NextResponse } from "next/server";
import { clientPromise, dbName} from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request) {
    const { 
        filter={}, 
        projection ={},
        options={}, 
        databaseName = dbName, 
        collectionName,
        objectIdFields = []
    } = await request.json();
    const client = await clientPromise
    const db = client.db(databaseName);
    const collection = db.collection(collectionName);
    convertFieldsToObjectId(projection, objectIdFields);
    
    if(filter['_id']){
        console.log(`--  filter _id: `, filter['_id'])
        filter['_id'] = new ObjectId(filter['_id'])
    }
    // exception handle
    if(collectionName == 'inventory' && filter['productId']){
        filter['productId'] = new ObjectId(filter['productId'])
        projection['selectedStoreInventory'].$filter.cond.$eq[1] = new ObjectId(projection['selectedStoreInventory'].$filter.cond.$eq[1]);    
        projection['otherStoreInventory'].$filter.cond.$ne[1] = new ObjectId(projection['otherStoreInventory'].$filter.cond.$ne[1]);    
    } else if(filter['inventorySummary.storeObjectId']){
        filter['inventorySummary.storeObjectId'] = new ObjectId(filter['inventorySummary.storeObjectId'])
    }

    const result = await collection
        .find(filter, {projection, ...options} )
        .toArray()
    console.log(`-- ${collectionName} projection: `, projection)

        console.log(`-- ${collectionName} result: `, result)
    
    return NextResponse.json({ result:result || null }, { status: 200 });
}

function convertFieldsToObjectId(obj, fields) {
  fields.forEach(path => {
    const keys = path.split('.');
    let ref = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (ref[keys[i]]) ref = ref[keys[i]];
      else return;
    }
    const lastKey = keys[keys.length - 1];
    if (ref[lastKey]) ref[lastKey] = new ObjectId(ref[lastKey]);
  });
}
