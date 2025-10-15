export const productInventoryURL = '/product-inventory'
export const brandAmplificationURL = '/brand-amplification'
export const modules = [
    { 
        name: 'Product Inventory', 
        description: 'Easily search for products and view up-to-date stock information.', 
        url: productInventoryURL, 
        disabled: false,
        labelText: "Accessible for store associates and above."
    },
    { 
        name: 'Brand Amplification', 
        description: 'Create and manage brand amplifications to boost product visibility inside the catalog.', 
        url: brandAmplificationURL, 
        disabled: false ,
        labelText: "Only accessible for authorized users."
    },
    { 
        name: 'Spoiled Inventory', 
        description: 'Access timely reports on products approaching spoilage, enabling preventive measures before expiration.', 
        url: '/module2', 
        disabled: true 
    },
]
export const APP_NAME = 'Leafy Portal'
export const PAGINATION_PER_PAGE = 20
export const BOOST_VALUES = [
    { label: 'low', value: 1 },
    { label: 'medium', value: 2 },
    { label: 'high', value: 3 },
]
export const BA_DEFAULT_NAME = `ba-${Date.now()}`

export const INIT_BRAND_AMPLIFICATION = {
    brand: "",
    categories: [],
    name: BA_DEFAULT_NAME,
    boostLevel: BOOST_VALUES[0].value, // default to 'low' boost value
}

export const SEARCH_OPTIONS = {
    search: {
        id: 2,
        label: 'MongoDB Search',
        description: 'Full-text search',
        enabled: process.env.NEXT_PUBLIC_ENABLE_ATLAS_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_ATLAS_SEARCH,
        recommendedTerms: ['green tea', 'cukie', 'chips']
    },
    vectorSearch: {
        id: 3,
        label: 'MongoDB Vector Search',
        description: 'Semantic search with vector embeddings',
        enabled: process.env.NEXT_PUBLIC_ENABLE_VECTOR_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_VECTOR_SEARCH,
        recommendedTerms: ['gift for a teen girl']
    },
    hybridSearch: {
        id: 4,
        label: 'Hybrid Search',
        description: 'Hybrid search',
        enabled: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_HYBRID_SEARCH,
        recommendedTerms: ['gift for a teen girl']
    },
    regex: {
        id: 1,
        label: 'Regex Search',
        description: 'Regular expression',
        enabled: process.env.NEXT_PUBLIC_ENABLE_FULLTEXT_SEARCH === 'true' || !process.env.NEXT_PUBLIC_ENABLE_FULLTEXT_SEARCH,
        recommendedTerms: ['high protein snack']
    }
}
export const SEARCH_FUSION_OPTIONS = {
    rankFusion: {
        id: 'rrf', //this matches with what the backen expects in request.body.fusionMode
        label: 'Rank Fusion ($rankFusion)',
    },
    scoreFusion: {
        id: 'scoreFusion', //this matches with what the backen expects in request.body.fusionMode
        label: 'Score Fusion ($scoreFusion)',
    },

}

export const USER_MAP = [
    {
        "_id": "65a546ae4a8f64e8f88fb89e",
        "userName": "Frida Kahlo",
        "name": "Frida",
        "surname": "Kahlo",
        "email": "frida.klo@gmail.com",
        "role": "Store Associate",
        "roleLevel": 2

    },
    {
        "_id": "66fe219d625d93a100528224",
        "userName": "Grace Hopper",
        "name": "Grace",
        "surname": "Hopper",
        "email": "grace.hopper@gmail.com",
        "role": "Store Manager",
        "roleLevel": 1

    },
    {
        "_id": "671ff0081ec726b417352702",
        "userName": "Ada Lovelace",
        "name": "Ada",
        "surname": "Lovelace",
        "email": "ada.lovelace@gmail.com",
        "role": "Brand Manager",
        "roleLevel": 1
    },
    {
        "_id": "671ff2451ec726b417352703",
        "userName": "Claude Monet",
        "name": "Claude",
        "surname": "Monet",
        "email": "claude.monet@gmail.com",
        "role": "Retail Operations Manager",
        "roleLevel": 1
    }
]
