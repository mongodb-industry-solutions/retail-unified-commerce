import React from 'react'
import { Badge, Container } from 'react-bootstrap'

const RegexSearchLearnMore = () => {
  return (
    <Container className="mt-3">
      <h3>What is Regex?</h3>
      <p>
        Regex (Regular Expression) search has been around since the 1950s, invented by mathematician Stephen Kleene as part
        of formal language theory. It is <strong>a sequence of characters that specifies a match pattern in text.</strong>
      </p>
      <p>
        By the 1990s and 2000s, regex was still a go-to tool for developers working with databases, logs, or unstructured
        text, especially in scripting, data cleaning, and search tasks. It was how search was done for decades — literal,
        rule-based, and good enough for structured or semi-structured data.
      </p>


      <h3>Why Regex Search Falls Short Today?</h3>
      <ul style={{ listStyle: "none", paddingLeft: 0, marginBottom: '10px' }}>
        <li>
          <Badge bg="primary" className="me-2">1</Badge>
          <strong>Literal Matching Only:</strong> Regex only matches exact patterns — no understanding of synonyms or context.<br />
          <span style={{ color: "#888" }}>Searching for "bike" won’t find "bicycle" or "mountain cycle".</span>
        </li>
        <li className="mt-2">
          <Badge bg="primary" className="me-2">2</Badge>
          <strong>Poor Relevance Ranking:</strong> Regex returns all matches equally — no sorting by how relevant or useful the result is.
        </li>
        <li className="mt-2">
          <Badge bg="primary" className="me-2">3</Badge>
          <strong>Not Scalable:</strong> Regex performs poorly on large datasets. It requires scanning every document, which is inefficient at scale.
        </li>
        <li className="mt-2">
          <Badge bg="primary" className="me-2">4</Badge>
          <strong>Language-Insensitive:</strong> No understanding of natural language, misspellings, or grammatical variations.<br />
          <span style={{ color: "#888" }}>Regex is “dumb” — great for patterns, terrible for meaning.</span>
        </li>
      </ul>
    </Container>
  )
}

export default RegexSearchLearnMore