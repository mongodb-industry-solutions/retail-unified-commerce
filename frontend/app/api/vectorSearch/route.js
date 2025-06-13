import { NextResponse } from "next/server";
import createEmbedding from "../createEmbeddings/route";
import { clientPromise } from "@/lib/mongodb";
import { PAGINATION_PER_PAGE } from "@/lib/constants";

export async function POST(request) {
  console.log('UNO', new Date())
  let { query, facets, pagination_page } = await request.json();

  let limit = request?.query?.limit || 12;
  if (!limit || limit > 100) {
    limit = 12;
  }
  if (!query) {
    query = ''
  }

  let embeddedSearchTerms = []
  try {
    embeddedSearchTerms = await createEmbedding([query]);
  } catch (error) {
    console.log('error: ', error)
  }
  console.log('UNO Y MEDIO', new Date())

  const EMBEDDING_FIELD_NAME = "embedding_desc_name_brand";
  const client = await clientPromise;
  const db = client.db(process.env.DB_NAME);
  const collection = db.collection("products");

  const pipeline = [
    {
      $vectorSearch: {
        index: 'vector_index_products',
        path: EMBEDDING_FIELD_NAME,
        queryVector: embeddedSearchTerms,
        numCandidates: 3000,
        limit: 3000
      }
    },
    {
      $addFields: {
        searchScore: { $meta: "vectorSearchScore" }
      }
    }
  ]

  // Apply facets filtering if provided
  if (facets) {
    const { selectedBrands, selectedCategories } = facets;

    let matchStage = {};

    if (selectedBrands && selectedBrands.length > 0) {
      matchStage.brand = { $in: selectedBrands };
    }

    if (selectedCategories && selectedCategories.length > 0) {
      matchStage.masterCategory = { $in: selectedCategories };
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
  }

  // Query 1: Get total count of matching documents
  const totalCount = await collection.aggregate(pipeline.concat([{ $count: "total" }])).toArray();
  const totalItems = totalCount.length > 0 ? totalCount[0].total : 0;

  // Query 2: Get paginated results
  const products = await collection
    .aggregate(pipeline)
    .skip(PAGINATION_PER_PAGE * pagination_page)
    .limit(PAGINATION_PER_PAGE)
    .toArray();
  console.log('DOS', new Date())

  return NextResponse.json({ products: products, totalItems: totalItems }, { status: 200 });

}