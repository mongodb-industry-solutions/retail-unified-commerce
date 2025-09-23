import { clientPromise, dbName } from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        let {
            databaseName = dbName,
            collectionName,
            indexName,
            brand,
            categories = []
        } = await request.json();

        const client = await clientPromise
        const db = client.db(databaseName);
        const collection = db.collection(collectionName);

        
let operator = brand && brand.trim() !== ""
  ? { text: { query: brand, path: "brand" } }  // or 'equals' if you prefer exact matching
  : { exists: { path: "brand" } };

if (categories.length > 0) {
  operator = {
    compound: {
      must: [ operator ],
      filter: [
        {
          text: { query: categories, path: "category" }
        }
      ]
    }
  };
}

const pipeline = [
  {
    $searchMeta: {
      index: indexName,
      facet: {
        operator: operator,
        facets: {
          categoriesFacet: { type: "string", path: "category" }
        }
      }
    }
  }
];

const pipeline2 = [
  {
    $searchMeta: {
      index: indexName,
      facet: {
        operator: {
          phrase: {
            query: brand,
            path: "brand"
          }
        },
        facets: {
          categoriesFacet: { type: "string", path: "category" }
        }
      }
    }
  }
];

const pipeline3 =  [
  {
    $searchMeta: {
      index: indexName,
      facet: {
        operator: {
          equals: {
            path: "brand",
            value: brand
          }
        },
        facets: {
          categoriesFacet: { type: "string", path: "category" }
        }
      }
    }
  }
];


const pipeline4 = [
  {
    $searchMeta: {
      index: indexName,
      facet: {
        operator: { phrase: { query: brand, path: "brand" } },
        facets: { categoriesFacet: { type: "string", path: "category" } }
      }
    }
  },
  {
    $addFields: {
      "facet.categoriesFacet.buckets": {
        $filter: {
          input: "$facet.categoriesFacet.buckets",
          as: "b",
          // Only keep categories that belong to documents where brand exactly matches the provided brand
          cond: { $eq: ["$$b._id", brand] }
        }
      }
    }
  }
];


        let [meta] = await collection.aggregate(pipeline).toArray();

        const mongoUri = process.env.MONGODB_URI || "";
        const deployment = mongoUri.includes(".mongodb.net") ? "atlas" : "enterprise";
        console.log('Deployment:', deployment);

        return NextResponse.json({
                meta: {meta, brand, categories},
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