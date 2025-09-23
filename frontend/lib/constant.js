export const productInventoryURL = '/product-inventory'
export const brandAmplificationURL = '/brand-amplification'
export const modules =[
    {name: 'Product Inventory', description: 'Easily search for products and view up-to-date stock information.', url: productInventoryURL, disabled: false},
    {name: 'Brand Amplification', description: 'Create and manage brand amplifications to boost product visibility inside the catalog to reach monthly KPIs.', url: brandAmplificationURL, disabled: false},
    {name: 'Spoiled Inventory', description: 'Access timely reports on products approaching spoilage, enabling preventive measures before expiration.', url: '/module2', disabled: true },
]

export const PAGINATION_PER_PAGE = 20
export const BOOST_VALUES = [
    {label: 'low', value: 1},
    {label: 'medium', value: 2},
    {label: 'high', value: 3},
]
export const BA_DEFAULT_NAME = `ba-${Date.now()}`

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
export const SEARCH_FUSION_OPTIONS = {
    rankFusion: {
        id: 1, //this matches with what the backen expects in request.body.fusionMode
        label: 'Rank Fusion ($rankFusion)',
    },
    scoreFusion: {
        id: 2, //this matches with what the backen expects in request.body.fusionMode
        label: 'Score Fusion ($scoreFusion)',
    },

}



