import React from 'react';

const searchOptions = [
  {
    option: 1,
    name: "Keyword Search",
    engine: "Regex / prefix match",
    details: "Fast, direct name match. No brand amplification."
  },
  {
    option: 2,
    name: "Full-text Search",
    engine: "Atlas Lucene $search",
    details: "Keyword search with boosting, fuzziness, synonyms. Brand amplification supported."
  },
  {
    option: 3,
    name: "Vector Search",
    engine: "Lucene $vectorSearch (k-NN, cosine)",
    details: "Semantic/natural-language queries using Voyage AI embeddings. Brand amplification supported."
  },
  {
    option: 4,
    name: "Hybrid Search",
    engine: "Text + Vector, Reciprocal Rank Fusion or Score Fusion",
    details: "Blends semantic and keyword relevance. Configurable weights and fusion mode. Brand amplification supported."
  }
];

const apiExample = `POST /api/v2/search
Content-Type: application/json

{
  "query": "green tea skin care",
  "storeObjectId": "684aa28064ff7c785a568aca",
  "option": 4, // 1=Keyword, 2=Text, 3=Vector, 4=Hybrid
  "page": 1,
  "page_size": 20,
  "brandAmplification": [
    { "name": "Innisfree", "boostLevel": 1 },
    { "name": "Olay", "boostLevel": 2 },
    { "name": "The Body Shop", "boostLevel": 3 }
  ]
  // parameters below only for option 4 (hybrid search)
  "textWeight": 0.7, // weight for text search (0 to 1)
  "vectorWeight": 0.3, // weight for vector search (0 to 1)
  "fusionMode": "RRF" // "RRF" (Reciprocal Rank Fusion) or "Score" (Score Fusion)
}
`;

const BrandAmplificationBehindScenes = () => {
  return (
    <div style={{
      background: "linear-gradient(90deg, #f8fafc 0%, #e0f7fa 100%)",
      padding: "32px",
      boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
    }}>
      <h2 style={{ color: "#1a237e", marginBottom: 12 }}>Brand Amplification: Behind the Scenes</h2>
      <p style={{ fontSize: "1.1rem", marginBottom: 18 }}>
        This demo is powered by a dedicated <strong>Advanced Search Microservice</strong> built with FastAPI, MongoDB Atlas, and Voyage AI. It enables product discovery using four search strategies, blending keyword, full-text, and semantic vector search in a single endpoint.
      </p>
      {/* Architecture Diagram Placeholder */}
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        padding: "20px",
        marginBottom: "24px",
        textAlign: "center"
      }}>
        <h3 style={{ color: "#0288d1", marginBottom: 8 }}>Architecture Overview</h3>
        <div style={{ marginBottom: "12px"}}>
          <img src="/images/talkTrack/search-ms.png" alt="Architecture Diagram" style={{ maxWidth: "100%", borderRadius: "8px" }} />
        </div>

      </div>
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        padding: "20px",
        marginBottom: "24px"
      }}>
        <h3 style={{ color: "#0288d1", marginBottom: 8 }}>How Search Works</h3>
        <ul style={{ paddingLeft: "1.2em" }}>
          <li>
            <strong>Query Processing:</strong> The microservice receives a free-text query, store context, and search strategy from the client.
          </li>
          <li>
            <strong>Search Execution:</strong> Depending on the selected option, it runs one or more searches:
            <ul>
              {searchOptions.map(opt => (
                <li key={opt.option}>
                  <strong>{opt.name}:</strong> {opt.engine} – <span style={{ color: "#00796b" }}>{opt.details}</span>
                </li>
              ))}
            </ul>
          </li>
          <li>
            <strong>Hybrid Fusion:</strong> For hybrid search, results from text and vector searches are blended using <span style={{ color: "#0288d1" }}>Reciprocal Rank Fusion (RRF)</span> or <span style={{ color: "#0288d1" }}>Score Fusion</span>, with configurable weights.
          </li>
          <li>
            <strong>Brand Amplification:</strong> If enabled, selected brands are boosted in the ranking, helping associates meet business goals and vendor agreements.
          </li>
          <li>
            <strong>Paginated Results:</strong> The service returns a paginated list of products, each with a relevance score and amplification status.
          </li>
        </ul>
      </div>
      <div style={{
        background: "#e3f2fd",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "left",
        fontSize: "1.08rem",
        color: "#1565c0",
        marginBottom: "18px"
      }}>
        <h4 style={{ marginBottom: 8 }}>Boosting Specific Products</h4>
        <div>
          <strong>Brand Amplification</strong> allows authorized users (admins or managers) to create amplification campaigns. When creating a brand amplification, the user selects a brand and may optionally provide a boost level (<strong>1</strong>, <strong>2</strong>, or <strong>3</strong>) to prioritize those brands in the ranking. If the <code>brandAmplification</code> field is not provided, the search runs normally without amplification. This is especially useful for real-time retail scenarios, such as highlighting promoted brands during weekly campaigns or meeting vendor sales targets.
        </div>
      </div>
      <div style={{
        background: "#fffde7",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "left",
        fontSize: "1.08rem",
        color: "#f57c00"
      }}>
        <h4 style={{ marginBottom: 8 }}>Voyage AI Embeddings</h4>
        <div>
          For semantic and natural-language search, this demo uses <strong>Voyage AI</strong> as the embedding model provider, specifically the <strong>voyage-3-large</strong> model. This enables the microservice to understand context and meaning in queries, delivering highly relevant results.
        </div>
      </div>
      <div style={{
        background: "#e3f2fd",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "left",
        fontSize: "1.08rem",
        color: "#1565c0",
        marginBottom: "18px",
        marginTop: "18px"
      }}>
        <h4 style={{ marginBottom: 8 }}>Learn More: Score Modifying in Atlas Search</h4>
        <div>
          To learn more about the score modifying options available to all operators, see the official MongoDB documentation:&nbsp;
          <a
            href="https://www.mongodb.com/docs/atlas/atlas-search/score/modify-score/#std-label-scoring-function"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#0288d1", textDecoration: "underline" }}
          >
            Modify Score in Atlas Search
          </a>
          .<br />
          This is how we are able to boost specific brands or categories inside the queries.
        </div>
      </div>
      <div style={{
        background: "#fff",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "left",
        fontSize: "1.08rem",
        color: "#333",
        marginBottom: "18px"
      }}>
        <h4 style={{ marginBottom: 8 }}>API Example</h4>
        <pre style={{
          background: "#f5f5f5",
          borderRadius: "6px",
          padding: "14px",
          fontSize: "0.98rem",
          overflowX: "auto"
        }}>
          {apiExample}
        </pre>
      </div>
      <div style={{
        background: "#fffde7",
        borderRadius: "8px",
        padding: "18px",
        textAlign: "left",
        fontSize: "1.08rem",
        color: "#f57c00"
      }}>
        <h4 style={{ marginBottom: 8 }}>Business Logic Highlights</h4>
        <ul style={{ paddingLeft: "1.2em", marginBottom: 0 }}>
          <li>Supports dynamic brand amplification for real-time promotions and sales targets</li>
          <li>Allows fine-tuning of search relevance via weights and fusion modes</li>
          <li>Returns consistent, paginated JSON responses with amplification status</li>
          <li>Handles validation and error cases gracefully (invalid options, boost levels, etc.)</li>
        </ul>
      </div>
    </div>
  );
};

export default BrandAmplificationBehindScenes;