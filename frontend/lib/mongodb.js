import { MongoClient } from "mongodb";
import { EJSON } from "bson";

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}
if (!process.env.DB_NAME) {
  throw new Error('Invalid/Missing environment variable: "DB_NAME"');
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const options = { };

let client;
let clientPromise;
const changeStreams = new Map();

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
  global._mongoClientPromise = clientPromise;
} else {
  clientPromise = global._mongoClientPromise;
}

async function getChangeStream(filter, key) {
  if (!changeStreams.has(key)) {
    const client = await clientPromise;
    const db = client.db(dbName);

    const filterEJSON = EJSON.parse(JSON.stringify(filter));

    const options = { fullDocument: 'updateLookup' };
    const pipeline = [{ $match: filterEJSON }];
    const changeStream = db.watch(pipeline, options);

    changeStream.on("change", (change) => {
      console.log("Change: ", change);
    });

    changeStream.on("error", (error) => {
      console.log("Error: ", error);
    });

    changeStreams.set(key, changeStream);
  }
  return changeStreams.get(key);
}

export { clientPromise, dbName, getChangeStream };