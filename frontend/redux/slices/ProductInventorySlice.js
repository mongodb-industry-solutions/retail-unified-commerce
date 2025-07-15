import { SEARCH_OPTIONS } from "@/lib/constant";
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
    toggleForceSearchWithEnter
} = ProductInventorySlice.actions

export default ProductInventorySlice.reducer
