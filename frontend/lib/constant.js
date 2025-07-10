export const productInventoryURL = '/product-inventory'
export const modules =[
    {name: 'Product Inventory', description: 'Easily search for products and view up-to-date stock information.', url: productInventoryURL, disabled: false},
    {name: 'Spoiled Inventory', description: 'Access timely reports on products approaching spoilage, enabling preventive measures before expiration.', url: '/module2', disabled: true },
]

export const PAGINATION_PER_PAGE = 20

export const SEARCH_OPTIONS = {
    search: {
        id: 2,
        label: 'Atlas Search',
        description: 'Full-text search'
    },
    vectorSearch: {
        id: 3,
        label: 'Vector Search',
        description: 'Semantic search with vector embeddings'
    },
    hybridSearch: {
        id: 4,
        label: 'Hybrid Search',
        description: 'Hybrid search'
    },
    regex: {
        id: 1,
        label: 'Regex Search',
        description: 'Regular expression'
    },
    // rerank: {
    //     id: 4,
    //     label: 'Hybrid Search + Rerank',
    //     description: 'Re rank results after the search'
    // },
}