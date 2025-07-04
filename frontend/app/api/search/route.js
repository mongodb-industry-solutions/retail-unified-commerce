import { NextResponse } from "next/server";
import { clientPromise } from "@/lib/mongodb";
import { PAGINATION_PER_PAGE } from "@/lib/constant";
import { ObjectId } from "mongodb";

export async function POST(request) {
    const {
        query,
        facets,
        pagination_page,
        storeObjectId,
        collectionName,
    } = await request.json();

    try {
        const client = await clientPromise;
        const db = client.db(process.env.DB_NAME);
        const collection = db.collection(collectionName);
        console.log('-------- collectionName: ', collectionName);
        // Build the aggregation pipeline
        const pipeline = [];

        // Conditionally add the $search stage if query is not empty
        if (query) {
            pipeline.push({
                $search: {
                    index: process.env.SEARCH_INDEX, // Use your index name
                    compound: {
                        should: [
                            {
                                text: {
                                    query: query,
                                    path: ['productName', 'brand', 'category', 'subCategory'],
                                    fuzzy: { maxEdits: 2 }
                                }
                            }
                        ]
                    }
                },

            });
            // Filter by inventorySummary.storeObjectId
            // I only want to get products that are inside this store
            if (storeObjectId) {
                pipeline.push({
                    $match: {
                        inventorySummary: {
                            $elemMatch: {
                                storeObjectId: new ObjectId(storeObjectId)
                            }
                        }
                    }
                });
            }
            pipeline.push({
                $project: {
                    _id: 1,
                    productName: 1,
                    imageUrlS3: 1,
                    inventorySummary: {
                        $filter: {
                            input: "$inventorySummary",
                            as: "item",
                            cond: { $eq: ["$$item.storeObjectId", new ObjectId(storeObjectId)] }
                        }
                    }, score: { $meta: "searchScore" }
                }
            });
            pipeline.push(
                {
                    $limit: 100, // Limit the number of results
                }
            );
        }

        // Add facet filtering stages if facets are provided
        if (facets) {
            const { selectedBrands, selectedCategories } = facets;
            if (selectedBrands && selectedBrands.length > 0) {
                pipeline.push({
                    $match: {
                        brand: { $in: selectedBrands }
                    }
                });
            }

            if (selectedCategories && selectedCategories.length > 0) {
                pipeline.push({
                    $match: {
                        masterCategory: { $in: selectedCategories }
                    }
                });
            }
        }

        // Query 1: Get total count of matching documents
        const totalCount = await collection.aggregate(pipeline.concat([{ $count: "total" }])).toArray();
        const totalItems = totalCount.length > 0 ? totalCount[0].total : 0;

        console.log('pipeline: ', JSON.stringify(pipeline, null, 2));
        console.log('storeObjectId', storeObjectId)
        // Query 2: Get paginated results
        const products = await collection
            .aggregate(pipeline)
            .skip(PAGINATION_PER_PAGE * pagination_page)
            .limit(PAGINATION_PER_PAGE)
            .toArray();


        console.log('RESULTS LENGTH: ', products.length);
        return NextResponse.json({ products: products, totalItems: totalItems }, { status: 200 });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}
