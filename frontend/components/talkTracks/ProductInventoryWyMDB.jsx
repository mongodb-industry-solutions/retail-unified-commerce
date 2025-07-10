import { Container } from 'react-bootstrap'

const ProductInventoryWyMDB = () => {
    return (
        <Container className='mt-3'>
            <h4>Why MongoDB Atlas? </h4>
            <p>With the right modern multi-cloud database, implementing the outlined key capabilities becomes a reality. MongoDB Atlas
                reduces complexity and enables a unified commerce architecture through:
            </p>
            <ul>
                <li>
                    <strong>Scalability and flexible document model:</strong> Supports complex data types, including vector embeddings, documents, graphs, and time series. Ideal for diverse and evolving datasets like catalogs, customer profiles, inventory, and transactions.
                </li>
                <li>
                    <strong>Real-time data:</strong> Enables seamless, real-time responses to operational data changes through Change Streams and Atlas Triggers. These capabilities make it easy to integrate with systems like shipping or inventory management, ensuring timely updates to the unified view.
                </li>
                <li>
                    <strong>Built-in search:</strong> Native support of Full-Text Search ($search) and Atlas Vector Search ($vectorSearch) reduces complexity and simplifies the architecture by eliminating the need for third-party tools.
                </li>
                <li>
                    <strong>Robust enterprise security and data privacy:</strong> Giving store associates access to a unified view of sensitive data requires strong security. MongoDB meets privacy regulations and offers built-in features like authentication, authorization, and full lifecycle data encryption (at rest, in transit, and in use).

                </li>
                <li>
                    <strong>Consolidates operational data:</strong> Acts as the core data layer, integrating information from systems like POS, e-commerce, and CRM into a unified platform.
                </li>
            </ul>

            <h4>Unified Commerce to Empower Store Associates</h4>
            <p>Retailers need to shift toward a unified commerce business strategy. Integrating all sales
                channels, data, and back-end systems into a seamless platform, providing a real time view of
                the business. This unified approach ensures that store associates can access the same accurate
                and up-to-date information as any other part of the business.
            </p>
            <p>
                Unified commerce aims to connect all aspects of a business, including online and offline sales channels,
                inventory management, order fulfillment, marketing, and customer data, into a unified view. Without
                replacing existing systems, MongoDB Atlas enables them to work together through a unified data strategy,
                functioning as an operational data layer.
            </p>

            <h4>Real-time inventory: Key capability to empower store associates  </h4>
            <p>
                In store, a unified commerce strategy comes to life through a user-friendly application, often on a tablet
                or smartphone, designed to aid associates with daily tasks. Key capabilities include:
            </p>
            <p>
                <strong>Real-time inventory:</strong> Instantly check stock availability in the current and nearby stores
                by connecting to existing inventory systems and real-time updates. An associate could say, “We're out of stock
                but, the X location has 10 units”.
            </p>
            <p>
                <strong>Intuitive search: </strong>Quickly locate products with full-text search (e.g., “The Duke and I book”), semantic search where context is crucial (e.g.,  “A romantic book saga for a teenager”), or hybrid search that blends traditional keyword matching with semantic understanding for smarter results. AI-powered recommendations further enhance the personal shopper experience by suggesting similar or complementary products.
            </p>
            <p>
                <strong>And more:</strong> Like seamless order management & cross channel fulfillment and access to customer context.
            </p>
        </Container>)
}

export default ProductInventoryWyMDB