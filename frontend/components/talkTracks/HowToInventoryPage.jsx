import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import Image from 'next/image'
import { Container } from 'react-bootstrap'

const HowToInventoryPage = (props) => {
    const {
        isSearchPage = true
    } = props

    return (
        <Container className='mt-3'>
            <h3>🔍 What to Highlight on This Page</h3>
            {
                isSearchPage == true
                    ? <>
                        <p>This page allows store associates to search for products available within
                            their store. The results will include all products associated with the store,
                            regardless of whether they are currently in stock.
                        </p>
                        <p>
                            The “Product Inventory” page is designed to emphasize the location and
                            availability of products inside the store. It also includes powerful tools to
                            enable faster and more intelligent searches across the product catalog — made
                            possible by a variety of available search types.
                        </p>
                    </>
                    : <>
                        <p>This page shows the details of a specific product. Below the general details,
                            you will find tabs containing information about the inventory for this product
                            inside the store selected at the beginning of the demo.
                        </p>
                    </>
            }


            <h3>👣 Steps to Demo This Page</h3>
            {
                isSearchPage
                    ? <>
                        <p>
                            <strong>1. </strong> Enter a search term in the input field.
                        </p>
                        <p>
                            <strong>2. </strong> Select a search method from the dropdown:
                        </p>
                        <ul>
                            <li>
                                <strong>Atlas Search.</strong> Powerful, full-text search.
                            </li>
                            <li>
                                <strong>Atlas Vector Search.</strong> Semantic, similarity-based searches over unstructured data (text, images, and audio) using vector embeddings.
                            </li>
                            <li>
                                <strong>Atlas Hybrid Search.</strong> Combines the power of full-text search and vector (semantic) search in a single query
                            </li>
                            <li>
                                <strong>Regex search.</strong> Looks for exact match pattern in text.
                            </li>
                        </ul>
                        <p>
                            <strong>3. </strong> Click “Search.”
                        </p>
                        <p>
                            <strong>4. </strong> The system will return a list of products available in the current store that match your query.
                        </p>
                    </>
                    : <>
                        <p>
                            <strong>1. </strong> Click on the <strong style={{color:'grey'}}>"See <Icon glyph="CurlyBraces"></Icon> Document"</strong> button to display the document model for this product.
                        </p>
                        <p>
                            <strong>2. </strong> Inside the <strong style={{color:'#00a35c'}}>“Locations tab”</strong>, click on the <Icon glyph="Wizard"></Icon>  icon to show how we can calculate distances easily with MongoDB’s geospatial queries.
                        </p>
                    </>
            }

            {
                isSearchPage
                && <>
                    <h3>📘 Understanding the Results</h3>

                    <p>Results are sorted by relevance, from most to least relevant.</p>
                    <div className='d-inline'>
                        <Badge variant="yellow"><Icon glyph="Favorite" /></Badge> <p className='d-inline'>The icon in the top-left corner shows the relevance score of the document (available for Atlas Search and Vector Search only).</p>
                    </div> <br></br>
                    <div className='d-inline'>
                        <Icon glyph="CurlyBraces" /><p className='d-inline'>The  icon in the top-right corner displays the complete product document model.</p>
                    </div>
                    <div className='d-flex justify-content-center mt-4 mb-4'>
                        <Image
                            src="/images/talkTrackResults.png"
                            alt="Product Inventory Page"
                            style={{ width: "95%", height: "auto" }}
                            width={800}
                            height={600}
                        ></Image>
                    </div>
                </>

            }

            {
                isSearchPage && <>
                    <h3>ℹ️ Notes</h3>
                    <p>The "Scan product" button is just for story telling. Behind the scenes it performs a regular findOne document query. </p>
                </>
            }
        </Container>
    )
}

export default HowToInventoryPage