import React from 'react'
import { Container, Table } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const indexDefinition = `
{
  "fields": [
    {
      "numDimensions": 1024,
      "path": "textEmbeddingVector",
      "similarity": "cosine",
      "type": "vector"
    }
  ]
}`

const vectorSearchQuery = `
results_pipeline = [
  {
      "$vectorSearch": {
          "index": self.index_name,
          "path": self.embedding_field,
          "queryVector": embedding,
          "numCandidates": 200,           # tune for recall / latency
          "limit": skip + page_size,      # fetch enough docs, then page
      }
  },
  {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
  {"$skip": skip},
  {"$limit": page_size},
]

# -- pipeline for total-hit count --
total_pipeline = [
  {
      "$vectorSearch": {
          "index": self.index_name,
          "path": self.embedding_field,
          "queryVector": embedding,
          "numCandidates": 200,
          "limit": 1,
      }
  },
  {"$count": "total"},
]
page_cursor = self.collection.aggregate(results_pipeline, maxTimeMS=4000)
results = await page_cursor.to_list(length=page_size)
`

const AtlasVectorSearchLearnMore = () => {
  return (
    <Container className="mt-3">
      <h3>What is Atlas Vector Search?</h3>
      <p>
        <a href="https://www.mongodb.com/atlas/vector-search" target="_blank" rel="noopener noreferrer">
          Atlas Vector Search
        </a> enables you to perform semantic, similarity-based searches over unstructured data (text, images, and audio) using vector embeddings. This is especially useful for applications like product recommendations, semantic search, and generative AI, where you want to find items that are "similar in meaning" rather than just matching keywords.
      </p>

      <h4 className="mt-2">How Does It Work?</h4>
      <ul>
        <li>
          You start by turning unstructured data (text, images, audio, etc.) into vectors using the embedding model of your preference. Our recommendation is <a href='https://www.voyageai.com/' target='_blank'>Voyage AI</a> for a number of reasons, please ask our team for more information.
        </li>
        <li>
          You create a <strong>vector search index</strong> on your collection, specifying which field contains the vector embeddings.
        </li>
        <li>
          When a user searches, we convert their query into a vector embedding and use Atlas Vector Search to find the most similar documents.
        </li>
      </ul>

      <h4 className="mt-2">Our Atlas Vector Search Index</h4>
      <p>
        Here is the definition of our Atlas Vector Search index for the <code>products</code> collection:
      </p>
      <Code language="json" showLineNumbers>
        {indexDefinition}
      </Code>

      <h4 className="mt-2">Our Atlas Vector Search Query</h4>
      <p>
        When a user searches, we run an aggregation pipeline with the <code>$vectorSearch</code> stage using <code>knnBeta</code> for vector similarity. Here’s an example:
      </p>
      <Code language="javascript" showLineNumbers>
        {vectorSearchQuery}
      </Code>

      <h4 className="mt-2">Customer Success Stories</h4>
      <a href='https://www.mongodb.com/solutions/customer-case-studies/fireworks-ai#introduction' target='_blank'>
        Fireworks AI powers enterprise-grade AI deployment with MongoDB
      </a><br /><br />
      <a href='https://www.mongodb.com/solutions/customer-case-studies/swisscom?tck=customer' target='_blank'>
        Swisscom stands up new Gen AI banking use case within 12 weeks with MongoDB
      </a><br /><br />
      <a href='https://www.mongodb.com/solutions/customer-case-studies/ceto-ai?tck=customer' target='_blank'>
        Ceto AI leverages MongoDB to drive AI insights for preventative maintenance in maritime industry
      </a>
      <br /><br />
    </Container>
  )
}

export default AtlasVectorSearchLearnMore