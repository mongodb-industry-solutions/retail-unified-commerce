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
const options = {  
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 50,          // handle more concurrent server requests
  minPoolSize: 5,
  maxIdleTimeMS: 60000,     // tolerate idle connections longer
  serverSelectionTimeoutMS: 10000, // wait for node discovery
  connectTimeoutMS: 10000,
  socketTimeoutMS: 120000,  // large enough for queries
  retryWrites: true,
  retryReads: true
};
let client;
let clientPromise;
const changeStreams = new Map();

async function getMongoClient() {
  if (isBuild) {
    // Dummy client for Next.js build
    return {
      db: () => ({
        collection: () => ({
          find: () => ({ toArray: async () => [] }),
          aggregate: () => ({ toArray: async () => [] })
        })
      })
    };
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }

  try {
    const client = await global._mongoClientPromise;
    await client.db().command({ ping: 1 }); // 🔑 health check
    return client;
  } catch (err) {
    console.warn("Mongo connection stale, reconnecting...", err);
    const client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
    return global._mongoClientPromise;
  }
}

async function getChangeStream(filter, key) {
  if (!changeStreams.has(key)) {
    const client = await getMongoClient();;
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

export { clientPromise, dbName, getMongoClient, getChangeStream };
