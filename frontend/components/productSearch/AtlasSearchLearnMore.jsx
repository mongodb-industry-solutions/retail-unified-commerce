import React from 'react'
import { Container, Table } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const indexDefinition = `
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "productName": {
        "type": "string"
      },
      "brand": {
        "type": "string"
      },
      "category": {
        "type": "string"
      },
      "subCategory": {
        "type": "string"
      },
      "inventorySummary": {
        "type": "document",
        "fields": {
          "storeObjectId": {
            "type": "objectId"
          }
        }
      }
    }
  }
}`

const searchQuery = `
pipeline = [
      {
          "$search": {
              "index": self.text_index,
              "compound": {
                  "should": [
                      {
                          "text": {
                              "query": query,
                              "path": "productName",
                              "score": {"boost": {"value": 3}},
                              "fuzzy": {"maxEdits": 2},
                              "synonyms": "default_synonyms",
                          }
                      },
                      {
                          "text": {
                              "query": query,
                              "path": ["brand", "category", "subCategory"],
                              "score": {"boost": {"value": 1}},
                              "fuzzy": {"maxEdits": 2},
                              "synonyms": "default_synonyms",
                          }
                      }
                  ]
              }
          }
      },
      {"$match": {"inventorySummary.storeObjectId": ObjectId(store_object_id)}},
      {"$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}},
      {"$facet": {
          "docs": [
              {"$skip": skip},
              {"$limit": page_size},
          ],
          "count": [{"$count": "total"}],
      }},
      {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
      {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
  ]
  agg = self.col.aggregate(pipeline, maxTimeMS=4000)
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