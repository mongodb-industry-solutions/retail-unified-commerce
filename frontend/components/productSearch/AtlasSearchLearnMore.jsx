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

const searchQuery = `db.products.aggregate([
  {
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
    }
  },
  { $limit: 10 }
])`

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

            <h4 className="mt-2">Customer Success Story</h4>
            <p> ....</p>
        </Container>
    )
}

export default VectorSearchLearnMore