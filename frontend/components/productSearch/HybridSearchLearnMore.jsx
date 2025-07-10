import React from 'react'
import { Container, Table } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const indexDefinition = `
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "productName": { "type": "string" },
      "brand": { "type": "string" },
      "category": { "type": "string" },
      "subCategory": { "type": "string" },
      "embedding": {
        "type": "knnVector",
        "dimensions": 384, // Example: adjust to your embedding size
        "similarity": "cosine"
      }
    }
  }
}`

const hybridSearchQuery = `db.products.aggregate([
  {
    $search: {
      index: process.env.HYBRID_INDEX, // Use your hybrid index name
      compound: {
        should: [
          {
            text: {
              query: "<user search input>",
              path: ["productName", "brand", "category", "subCategory"],
              fuzzy: {}
            }
          },
          {
            knnBeta: {
              vector: <your_query_embedding>,
              path: "embedding",
              k: 10
            }
          }
        ]
      }
    }
  },
  { $limit: 10 }
])`

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
          You create a <strong>hybrid search index</strong> on your collection, specifying both text fields and a vector field.
        </li>
        <li>
          <strong>In our case, we index fields such as:</strong> <code>productName</code>, <code>brand</code>, <code>category</code>, <code>subCategory</code> (for text search), and <code>embedding</code> (for vector search).
        </li>
        <li>
          When a user searches, we run a <code>compound</code> query that combines both text and vector search, so results can match either or both criteria.
        </li>
      </ul>

      <h4 className="mt-2">Our Hybrid Search Index</h4>
      <p>
        Here is the definition of our Hybrid Search index for the <code>products</code> collection:
      </p>
      <Code language="json" showLineNumbers>
        {indexDefinition}
      </Code>

      <h4 className="mt-2">Our Hybrid Search Query</h4>
      <p>
        When a user searches, we run an aggregation pipeline with the <code>$search</code> stage using <code>compound</code> to combine text and vector search. Here’s an example:
      </p>
      <Code language="javascript" showLineNumbers>
        {hybridSearchQuery}
      </Code>

      <h4 className="mt-2">Key Hybrid Search Operators</h4>
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
            <td><code>compound</code></td>
            <td>Combines multiple search clauses (e.g., text and vector) using logical operators like <code>should</code>, <code>must</code>, and <code>mustNot</code>.</td>
            <td><code>{`compound: { should: [ ... ] }`}</code></td>
          </tr>
          <tr>
            <td><code>text</code></td>
            <td>Performs full-text search on specified fields.</td>
            <td><code>{`text: { query: "chips", path: ["productName"] }`}</code></td>
          </tr>
          <tr>
            <td><code>knnBeta</code></td>
            <td>Performs vector similarity search using embeddings.</td>
            <td><code>{`knnBeta: { vector: <query_embedding>, path: "embedding", k: 10 }`}</code></td>
          </tr>
          <tr>
            <td><code>limit</code></td>
            <td>Limits the number of results returned.</td>
            <td><code>{`{ $limit: 10 }`}</code></td>
          </tr>
        </tbody>
      </Table>

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