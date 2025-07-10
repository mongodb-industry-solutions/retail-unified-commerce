import React from 'react'
import { Container } from 'react-bootstrap'
import Code from '@leafygreen-ui/code'

const indexDefinition = `
TODO
`

const hybridSearchQuery = `TODO`

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