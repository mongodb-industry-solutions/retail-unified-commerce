import React from 'react'
import { Container, Table } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const indexDefinition = `
{
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "brand": {
        "type": "string"
      },
      "category": {
        "type": "string"
      },
      "inventorySummary": {
        "fields": {
          "storeObjectId": {
            "type": "objectId"
          }
        },
        "type": "document"
      },
      "productName": {
        "type": "string"
      },
      "subCategory": {
        "type": "string"
      }
    }
  }
}`

const searchQuery = `
pipeline = [
        # 1) Atlas Search compound query (prefix fuzzy boosts)
        {
            "$search": {
                "index": text_index,
                "compound": {
                    "should": [
                        {   # productName – strongest signal
                            "text": {
                                "query": query,
                                "path":  "productName",
                                "score": {"boost": {"value": 0.8}},
                                "fuzzy": {"maxEdits": 2},
                            }
                        },
                        {   # brand – moderate
                            "text": {
                                "query": query,
                                "path":  "brand",
                                "score": {"boost": {"value": 0.1}},
                            }
                        },
                        {   # category – low weight
                            "text": {
                                "query": query,
                                "path":  "category",
                                "score": {"boost": {"value": 0.06}},
                            }
                        },
                        {   # subCategory – very low
                            "text": {
                                "query": query,
                                "path":  "subCategory",
                                "score": {"boost": {"value": 0.04}},
                            }
                        },
                    ]
                },
            }
        },

        # 2) Promote Atlas relevance into a normal field
        {"$set": {"score": {"$meta": "searchScore"}}},

        # 3) Filter by store (inventorySummary array)
        {
            "$match": {
                "inventorySummary": {
                    "$elemMatch": {"storeObjectId": store_oid}
                }
            }
        },

        # 4) Facet: paginate & count
        {
            "$facet": {
                "docs": [
                    {"$project": projection},
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count": [{"$count": "total"}],
            }
        },

        # 5) Flatten and default total=0
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project":  {"count": 0}},
    ]
  `

const VectorSearchLearnMore = () => {
  return (
    <Container className="mt-3">
      <h3>What is Atlas Search?</h3>
      <p>
        <a href="https://www.mongodb.com/atlas/search" target="_blank" rel="noopener noreferrer">
          Atlas Search
        </a> is a powerful, full-text search capability built directly into MongoDB Atlas. It allows you to perform rich, relevance-based searches on your data without needing to sync to a separate search engine.
      </p>

      <h4 className="mt-2">How Does It Work?</h4>
      <ul>
        <li>
          You define a <strong>search index</strong> on your collection, specifying which fields should be searchable.
        </li>
        <li>
          <strong>In our case, we index fields such as:</strong> <code>productName</code>, <code>brand</code>, <code>category</code>, <code>subCategory</code>, etc.
          {/* Add or edit fields as needed */}
        </li>
        <li>
          When a user searches, Atlas Search uses this index to quickly find and rank relevant documents.
        </li>
      </ul>

      <h4 className="mt-2">Our Atlas Search Index</h4>
      <p>
        Here is the definition of our Atlas Search index for the <code>products</code> collection:
      </p>
      <Code language="json" showLineNumbers>
        {indexDefinition}
      </Code>

      <h4 className="mt-2">Our Atlas Search Query</h4>
      <p>
        When a user searches, we run an aggregation pipeline with the <code>$search</code> stage. Here’s an example:
      </p>
      <Code language="javascript" showLineNumbers>
        {searchQuery}
      </Code>

      <h4 className="mt-2">Key Atlas Search Operators</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Operator</th>
            <th>Description</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>limit</code></td>
            <td>Limits the number of results returned.</td>
            <td><code>{`{ $limit: 10 }`}</code></td>
          </tr>
          <tr>
            <td><code>fuzzy</code></td>
            <td>Enables typo-tolerance and fuzzy matching for user queries.</td>
            <td><code>{`fuzzy: { maxEdits: 2 }`}</code></td>
          </tr>
        </tbody>
      </Table>

      <h4 className="mt-2">Customer Success Stories</h4>
      <a href='https://www.mongodb.com/customers/albertsons' target='_blank'>
        MongoDB Atlas Search Powers the Albertsons Promotions Engine
      </a> <br></br><br></br>
      <a href='https://www.mongodb.com/solutions/customer-case-studies/rezolve-ai' target='_blank'>
        Rezolve Ai modernizes product discovery platform to improve search performance with MongoDB
      </a><br></br><br></br>
      <a href='https://www.mongodb.com/solutions/customer-case-studies/delivery-hero' target='_blank'>
        Delivery Hero helps customers navigate more than 100 million products with MongoDB Atlas Search
      </a>
<br></br><br></br>
    </Container>
  )
}


export default VectorSearchLearnMore