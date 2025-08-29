export const productInventoryURL = '/product-inventory'
export const modules =[
    {name: 'Product Inventory', description: 'Easily search for products and view up-to-date stock information.', url: productInventoryURL, disabled: false},
    {name: 'Spoiled Inventory', description: 'Access timely reports on products approaching spoilage, enabling preventive measures before expiration.', url: '/module2', disabled: true },
]

export const PAGINATION_PER_PAGE = 20

export const SEARCH_OPTIONS = {
    search: {
        id: 2,
        label: 'MongoDB Search',
        description: 'Full-text search',
        enabled: process.env.NEXT_PUBLIC_ENABLE_ATLAS_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_ATLAS_SEARCH
    },
    vectorSearch: {
        id: 3,
        label: 'MongoDB Vector Search',
        description: 'Semantic search with vector embeddings',
        enabled: process.env.NEXT_PUBLIC_ENABLE_VECTOR_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_VECTOR_SEARCH
    },
    hybridSearch: {
        id: 4,
        label: 'Hybrid Search',
        description: 'Hybrid search',
        enabled: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_HYBRID_SEARCH
    },
    regex: {
        id: 1,
        label: 'Regex Search',
        description: 'Regular expression',
        enabled: process.env.NEXT_PUBLIC_ENABLE_FULLTEXT_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_FULLTEXT_SEARCH
    }
}