import { MongoClient } from "mongodb";
import { EJSON } from "bson";

// Skip env validation during Next.js build process
// Environment variables will be available at runtime in Kanopy
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

if (!isBuild) {
  if (!process.env.MONGODB_URI) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
  }
  if (!process.env.DB_NAME) {
    throw new Error('Invalid/Missing environment variable: "DB_NAME"');
  }
}

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "default";
const options = { };

let client;
let clientPromise;
const changeStreams = new Map();

if (!isBuild) {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
    global._mongoClientPromise = clientPromise;
  } else {
    clientPromise = global._mongoClientPromise;
  }
} else {
  // Dummy promise during build
  clientPromise = Promise.resolve({
    db: () => ({
      collection: () => ({
        find: () => ({ toArray: () => [] }),
        aggregate: () => ({ toArray: () => [] })
      })
    })
  });
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
