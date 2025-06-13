import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
    name: "Global",
    initialState: {
        stores: [],
        selectedStore: null,
    },
    reducers: {
        setStores(state, action) {
            return {
                ...state,
                stores: action.payload.stores || [],
            };
        },
        setSelectedStore(state, action) {
            return {
                ...state,
                selectedStore: action.payload.store || null,
            };
        },
    }
})

export const {
    setStores,
    setSelectedStore
} = GlobalSlice.actions

export default GlobalSlice.reducer
