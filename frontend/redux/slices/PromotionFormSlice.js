import { BA_DEFAULT_NAME, BOOST_VALUES } from "@/lib/constant";
import { createSlice } from "@reduxjs/toolkit";

const BrandAmplificationFormSlice = createSlice({
    name: "BrandAmplificationForm",
    initialState: {
        // the form values are in 'brandAmplification'
        brandAmplification: {
            brand: "",
            categories: [],
            name: BA_DEFAULT_NAME,
            boostValue: BOOST_VALUES[0].value, // default to 'low' boost value
        },
        // for select options for brand
        brandSelector: {
            loading: true,
            error: null,
            data: []
        },
        // for select options for categories
        categoriesSelector: {
            loading: true,
            error: null,
            data: [
                { name: 'Fruits & Vegetables' },
                { name: 'Eggs, Meat & Fish' },
                { name: 'brand c' },
                { name: 'brand d' },
                { name: 'brand e' },
            ]
        },
        // the list of active brand, these are taken from the MongoDB
        // collection and the ones stored in the users' local storage
        brandAmplificationList: {
            loading: true,
            error: null,
            data: []
        },
        metaSearch: null
    },
    reducers: {
        setBrandSelectorLoading(state, action) {
            console.log('setBrandSelectorLoading action payload:', action.payload);
            state.brandSelector.loading = action.payload.loading;
        },
        setBrandSelectorError(state, action) {
            console.log('setBrandSelectorError action payload:', action.payload);
            state.brandSelector.error = action.payload.error;
        },
        setBrandSelector(state, action) {
            console.log('setBrandSelector action payload:', action.payload);
            state.brandSelector.data = action.payload.brands || [];
        },
        setBrand(state, action) {
            console.log('setBrand action payload:', action.payload);
            let name = state.brandAmplification.name
            if (name.startsWith('ba-')) {
                const brandDashed = action.payload.brand ? action.payload.brand.replace(/\s+/g, '-') : '';
                state.brandAmplification.name = `ba-${brandDashed}-${Date.now()}`
            }
            state.brandAmplification.brand = action.payload.brand || '';
            state.categoriesSelector.data = action.payload.categories || [];
            if(!action.payload.brand)
                state.brandAmplification.categories = []

        },
        setBrandAmplificationField(state, action) {
            console.log('setBrandAmplification action payload:', action.payload);
            state.brandAmplification[action.payload.field] = action.payload.value;
        },
        setBrandAmplificationList(state, action) {
            console.log('setBrandAmplificationList action payload:', action.payload.list);
            state.brandAmplificationList.data = [...action.payload.list];
        },
        addBrandAmplifications(state, action) {
            // action.payload should be an array of brandAmplifications
            state.brandAmplificationList.data = [
                ...state.brandAmplificationList.data,
                ...action.payload
            ];
        },
        removeBrandAmplification(state, action) {
            // action.payload should be the brandAmplification to remove (by id or unique property)
            state.brandAmplificationList.data = state.brandAmplificationList.data.filter(
                item => item._id !== action.payload._id
            );
        },
        setMetaSearch(state, action) {
            state.metaSearch = action.payload.metaSearch;
        }
    }
})

export const {
    setBrand,
    setBrandAmplificationField,
    setBrandAmplificationList,
    addBrandAmplifications,
    removeBrandAmplification,
    setMetaSearch,
    setBrandSelectorLoading,
    setBrandSelectorError,
    setBrandSelector
} = BrandAmplificationFormSlice.actions

export default BrandAmplificationFormSlice.reducer
