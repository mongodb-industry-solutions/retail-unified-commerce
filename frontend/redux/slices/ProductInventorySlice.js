import { createSlice } from "@reduxjs/toolkit";

const a = {
    "products": [
        {
            "_id": "68416e8664ff7c785a5649bf",
            "description": "- Name: MMILK Fresh Milk 2 L\n- Brand: MMILK\n- Unit Amount: 1 box",
            "sku": "ntu56km2",
            "title": "Delicious, 100% coconut milk 150 ml x 6 boxes",
            "score": 6.24829626083374
        },
        {
            "_id": "68416e8664ff7c785a564a2f",
            "description": "- Name: BABI MILD Talcum Double Milk 380 G X 2\n- Brand: BABI MILD\n- Unit Amount: 2 can.",
            "sku": "hijzydbp",
            "title": "Mali, 100% tomato juice, 200ml x6 boxes",
            "score": 4.92844820022583
        },
        {
            "_id": "68416e8364ff7c785a564419",
            "description": "- Name: BABI MILD Talcum Sweety Pink 180 G X 3\n- Brand: BABI MILD\n- Unit Amount: 3 can.",
            "sku": "rn9pinns",
            "title": "Baby Mind Baby Baby Double Milk Protein 180 grams Pack 3 cans",
            "score": 4.646217346191406
        },
        {
            "_id": "68416e7b64ff7c785a56327a",
            "description": "- Name: Black Mustard Seeds 200g\n- Brand: MAKRO",
            "sku": "Ut66llwk",
            "title": "Dutch Mill, fresh paste milk, 400ml",
            "score": 4.292585372924805
        },
        {
            "_id": "68416e7e64ff7c785a5637f6",
            "description": "- Name: SYMPHONI Cookies With Chocolate Flavoured Cream Filling 25g x 12 pcs\n- Brand: SYMPHONI\n- Unit Amount: 12 piece",
            "sku": "rv8efn",
            "title": "Dutch Mill, fresh pasteurized milk, 830ml",
            "score": 4.292585372924805
        },
        {
            "_id": "68416e9164ff7c785a5663cf",
            "description": "- Name: Babi Mild Double Milk Body Bath 950 ml\n- Brand: BABI MILD",
            "sku": "1lafmqsm",
            "title": "Boxjourney กล่องใส่แก้วคราฟ 10x10x8.5 ซม. (50 ใบ/แพค)",
            "score": 4.149318695068359
        },
        {
            "_id": "68416e8a64ff7c785a565446",
            "description": "- Name: PRAOHOM Coconut Milk 1000 Ml X 2 Boxes\n- Brand: PRAOHOM\n- Unit Amount: 2 box",
            "sku": "c-snksrn",
            "title": "M&M Milk chocolate 14.5 grams x 20 pieces",
            "score": 4.057399749755859
        },
        {
            "_id": "68416e8a64ff7c785a565287",
            "description": "- Name: CHUPA CHUPS Mini Tongue Painter 6 G X 50 Pcs\n- Brand: CHUPA CHUPS\n- Unit Amount: 1 box",
            "sku": "1ln_fc5j",
            "title": "Seeding chicken, fresh milk, frozen milk, 700 grams",
            "score": 3.9402735233306885
        },
        {
            "_id": "68416e8364ff7c785a56453c",
            "description": "- Name: MMILK Pasteurized Lactose Free Milk Plain Flavour 1000ml\n- Brand: MMILK\n- Unit Amount: 1 bottle",
            "sku": "KWP3JWV",
            "title": "Boxjourney, small snack, crafting paper (20 cards/pack)",
            "score": 3.910964012145996
        },
        {
            "_id": "68416e7e64ff7c785a5637be",
            "description": "- Name: Palmolive Naturals Shower Milk Irresistible Softness 500 ml\n- Brand: PALMOLIVE",
            "sku": "JB-SO7WD",
            "title": "Yo French wafer, stuffed with 32 grams of milk cream, pack of 12 pieces",
            "score": 3.8483660221099854
        },
        {
            "_id": "68416e7b64ff7c785a563204",
            "description": "- Name: Dutch Mill Pasteurized Milk Plain Flavoured 400 ml\n- Brand: DUTCHMILL",
            "sku": "297wpmu",
            "title": "Viola, honey -smelling cookie 125 grams",
            "score": 3.7735249996185303
        },
        {
            "_id": "68416e7f64ff7c785a563b24",
            "description": "- Name: BABI MILD Talcum Double Milk 50 G X 6\n- Brand: BABI MILD\n- Unit Amount: 6 can.",
            "sku": "DFZ7SMXI",
            "title": "Sop Pae, a deep white rim 8 inches",
            "score": 3.767261505126953
        },
        {
            "_id": "68416e8464ff7c785a564657",
            "description": "- Name: BABI MILD Talcum Double Milk 180 G X 3\n- Brand: BABI MILD\n- Unit Amount: 3 can.",
            "sku": "s8xb6cmv",
            "title": "CP Fried Shrimp Ball 100 grams x 3 Pack",
            "score": 3.767261505126953
        },
        {
            "_id": "68416e9a64ff7c785a5677d9",
            "description": "- Name: Babi Mild Double Milk Protein Plus Baby Lotion 400 ml x 3 pcs\n- Brand: BABI MILD",
            "sku": "veesrdbz",
            "title": "ซี โปรดักส์ หอยแมลงภู่นิวซีแลนด์ครึ่งฝาแช่แข็ง Size M 1 กก.",
            "score": 3.767261505126953
        },
        {
            "_id": "68416e7b64ff7c785a56328a",
            "description": "- Name: Dutch Mill Non Fat Pasteurized Milk Plain 400 ml\n- Brand: DUTCHMILL",
            "sku": "uwccm-2d",
            "title": "Jele Light Jelly Karaji Nan, lychee flavor 125 ml. Pack 6 cups.",
            "score": 3.6805543899536133
        },
        {
            "_id": "68416e7b64ff7c785a5634b4",
            "description": "- Name: Young Chinese Kale 250g\n- Brand: MAKRO\n- Unit Amount: 1 pack",
            "sku": "Snu_vuf5",
            "title": "Dutch Mill Delight, Sour Milk 160ml x 4 bottles",
            "score": 3.673211097717285
        },
        {
            "_id": "68416e8664ff7c785a564a9e",
            "description": "- Name: Champion Ags Recycle 24 x 28\"60Ps\n- Brand: CHAMPION",
            "sku": "7y3zwvf",
            "title": "Dutch Mill, fresh milk, oily butter, taste 2000 ml.",
            "score": 3.673211097717285
        },
        {
            "_id": "68416e8a64ff7c785a565301",
            "description": "- Name: Milk Frother  Battery Operate\n- Brand: MY PAN",
            "sku": "vmwrts4n",
            "title": "H-223 steel file horse",
            "score": 3.632594108581543
        },
        {
            "_id": "68416e7e64ff7c785a563618",
            "description": "- Name: Dutch Mill Delight Fermented Milk 160 ml x 4 Pcs\n- Brand: DUTCHMILL",
            "sku": "pbrhm0ql",
            "title": "To Fu Oishi, the dwarf tofu received 275 grams.",
            "score": 3.592055320739746
        },
        {
            "_id": "68416e8364ff7c785a56426a",
            "description": "- Name: CARNATION Evaporated Milk 1kg\n- Brand: CARNATION\n- Unit Amount: 1 bottle",
            "sku": "Sakd_R-4",
            "title": "Unicharam Tree Daily Mask Daily Mask M x 10 pieces",
            "score": 3.5703704357147217
        }
    ],
    "totalItems": 100
}
const ProductInventorySlice = createSlice({
    name: "ProductInventory",
    initialState: {
        searchResults: [],
        totalItems: 0, // Total number of items for pagination
        pagination_page: 0,
        productDetails: null, // the product from the product collection
        productInventory: null, // the product from the inventory collection
        searchType: 'search', // 'search' or 'vector-search'
        loading: false,
        error: null,
        query: null, // The search query string
    },
    reducers: {
        setSearchResults(state, action) {
            return {
                ...state,
                searchResults: action.payload.results, // Assuming results is an array of products
                totalItems: action.payload.totalItems || 0, // Assuming totalItems is provided
                loading: false,
                error: null,
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
        setDistancesFromOtherStores(state, action){

        },
        setProductQuery(state, action) {
            return {
                ...state,
                query: action.payload.query, // Assuming query is a string
                loading: false,
                error: null,
            };
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
    setCurrentPage,
    setDistancesFromOtherStores
} = ProductInventorySlice.actions

export default ProductInventorySlice.reducer
