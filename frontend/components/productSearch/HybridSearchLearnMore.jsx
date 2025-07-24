import React from 'react'
import { Container } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const hybridSearchQuery = `
 [
        # 1) Hybrid rank fusion
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorPipeline": [
                            {"$vectorSearch": {
                                "index": vector_index,
                                "path": vector_field,
                                "queryVector": embedding,
                                "numCandidates": num_candidates,
                                "limit": knn_limit,
                            }}
                        ],
                        "textPipeline": [
                            {"$search": {
                                "index": text_index,
                                "compound": {
                                    "should": [
                                        {"text": {"query": query, "path": "productName", "score": {"boost": {"value": 0.8}}, "fuzzy": {"maxEdits": 2}}},
                                        {"text": {"query": query, "path": "brand",       "score": {"boost": {"value": 0.1}},}},
                                        {"text": {"query": query, "path": "category",    "score": {"boost": {"value": 0.06}},}},
                                        {"text": {"query": query, "path": "subCategory", "score": {"boost": {"value": 0.04}},}},
                                    ]
                                }
                            }},
                            {"$limit": knn_limit},
                        ],
                    }
                },
                "combination": {"weights": weights}, //weights is a Dict[str, float],
                "scoreDetails": True,
            }
        },

        # 2) Filter to our store
        {"$match": {"inventorySummary.storeObjectId": store_oid}},

        # 3) Facet for pagination + total count
        {"$facet": {
            "docs": [
                {"$project": projection},
                {"$skip":   skip},
                {"$limit":  limit},
            ],
            "count": [{"$count": "total"}],
        }},

        # 4) Unwind + default total to 0
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]
`

const HybridSearchLearnMore = () => {
  return (
    <Container className="mt-3">
      <h3>What is Hybrid Search?</h3>
      <p>
        <a href="https://www.mongodb.com/docs/atlas/atlas-search/hybrid-search/" target="_blank" rel="noopener noreferrer">
          Hybrid Search
        </a> in MongoDB Atlas combines the power of full-text search and vector (semantic) search in a single query. This allows you to retrieve results that match both keyword relevance and semantic similarity, providing a more robust and flexible search experience for users.
      </p>

      <h4 className="mt-2">How Does It Work?</h4>
      <ul>
        <li>
          When a user searches, we run a <code>compound</code> query that combines both text and vector search, so results can match either or both criteria.
        </li>
        <li>
          Mixes Atlas $search (text) and Lucene $vectorSearch with $rankFusion.
        </li>
        <li>
          We have added weight for semantic and text search, to give more weight to one or another depending on the query.
        </li>
      </ul>

      <h4 className="mt-2">Our Hybrid Search Query</h4>
      <p>
        When a user searches, we run an aggregation pipeline with the <code>$search</code> stage using <code>compound</code> to combine text and vector search. Here’s an example:
      </p>
      <Code language="javascript" showLineNumbers>
        {hybridSearchQuery}
      </Code>

      <h4 className="mt-2">Learn more</h4>
      <a href='https://www.mongodb.com/company/blog/innovation/top-use-cases-for-text-vector-and-hybrid-search?utm_source=chatgpt.com' target='_blank'>
        Top Use Cases for Text, Vector, and Hybrid Search
      </a><br /><br />
      <a href='https://www.mongodb.com/company/blog/product-release-announcements/boost-search-relevance-mongodb-atlas-native-hybrid-search?utm_source=chatgpt.com' target='_blank'>
        Boost Search Relevance with MongoDB Atlas’ Native Hybrid Search
      </a><br /><br />

      <br /><br />
    </Container>
  )
}

export default HybridSearchLearnMore