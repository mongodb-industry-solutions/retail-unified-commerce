import { SEARCH_FUSION_OPTIONS, SEARCH_OPTIONS } from "@/lib/constant";
import { createSlice } from "@reduxjs/toolkit";
 
const ProductInventorySlice = createSlice({
    name: "ProductInventory",
    initialState: {
        searchResults: [],
        totalItems: 0, // Total number of items for pagination
        pagination_page: 0,
        productDetails: null, // the product from the product collection
        productInventory: null, // the product from the inventory collection
        searchType: SEARCH_OPTIONS.search.id, // 'search' or 'vector-search'
        vectorSearchWeight: 0.5,
        searchWeight: 0.5,
        fusionMode: SEARCH_FUSION_OPTIONS.rankFusion.id, // 'rankFusion' or 'scoreFusion'
        initialLoad: true, // Used to determine if the page is loading for the first time
        loading: false,
        error: null,
        query: null, // The search query string
        scanProductSearch: 0,
        forceSearchWithEnterToggle: 0
    },
    reducers: {
        setSearchResults(state, action) {
            return {
                ...state,
                searchResults: action.payload.results, // Assuming results is an array of products
                totalItems: action.payload.totalItems || 0, // Assuming totalItems is provided
                loading: false,
                error: null,
                initialLoad: false,
                scanProductSearch: action.payload.scanProductSearch || 0, // Assuming scanProductSearch is an int
            };
        },
        searchIsLoading(state, action) {
            return {
                ...state,
                searchResults: [], // Assuming results is an array of products
                loading: true,
                error: null,
            }
        },
        searchProductError(state, action) {
            return {
                ...state,
                searchResults: [],
                loading: false,
                error: action.payload.error, // Assuming error is an object with error details
            };
        },
        toggleForceSearchWithEnter(state, action) {
            return {
                ...state,
                forceSearchWithEnterToggle: !state.forceSearchWithEnterToggle
            };
        },
        setProductDetails(state, action) {
            let newState =  {
                ...state,
                productDetails: action.payload.product, // Assuming product is an object with product details
                loading: false,
                error: null,
            };

            if(action.payload.product === null) newState.productInventory = null; // Reset productInventory if productDetails is null

            return newState;
        },
        setProductInventory(state, action) {
            return {
                ...state,
                productInventory: action.payload.inventory, // Assuming product is an object with product details
                loading: false,
                error: null,
            };
        },
        setProductQuery(state, action) {
            return {
                ...state,
                query: action.payload.query, // Assuming query is a string
                loading: false,
                error: null,
            };
        },
        setSearchType(state, action) {
            state.searchType = action.payload.searchType; // Assuming searchType is an int
        },
        setCurrentPage: (state, action) => {
            return {
                ...state,
                pagination_page: action.payload
            }
        },
        setSearchWeight: (state, action) => {
            return {
                ...state,
                searchWeight: Number(action.payload.searchWeight), // Assuming SearchWeight is a float
                vectorSearchWeight: 1 - Number(action.payload.searchWeight)
            };
        },
        setVectorSearchWeight: (state, action) => {
            return {
                ...state,
                vectorSearchWeight: Number(action.payload.vectorSearchWeight), // Assuming vectorSearchWeight is a float
                searchWeight: 1 - Number(action.payload.vectorSearchWeight) // Assuming SearchWeight is a float

            };
        },
        setFusionMode(state, action) {
            state.fusionMode = action.payload.fusionMode; // Assuming fusionMode is an int
        }
    }
})

export const {
    setSearchResults,
    searchIsLoading,
    searchProductError,
    setProductDetails,
    setProductInventory,
    setProductQuery,
    setSearchType,
    setCurrentPage,
    toggleForceSearchWithEnter,
    setSearchWeight,
    setVectorSearchWeight,
    setFusionMode
} = ProductInventorySlice.actions

export default ProductInventorySlice.reducer
