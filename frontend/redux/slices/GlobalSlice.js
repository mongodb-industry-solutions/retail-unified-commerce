import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
    name: "Global",
    initialState: {
        stores: [],
        selectedStore:'684aa28064ff7c785a568aca'// null,

    },
    reducers: {
        setStores(state, action) {
            console.log('setStores action payload:', action.payload);
            return {
                ...state,
                stores: action.payload.stores || [],
                selectedStore: action.payload.stores.length > 0 ? action.payload.stores[0]._id : null,
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
