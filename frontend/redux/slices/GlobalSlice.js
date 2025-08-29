import { createSlice } from "@reduxjs/toolkit";

const GlobalSlice = createSlice({
    name: "Global",
    initialState: {
        stores: [],
        selectedStore: '684aa28064ff7c785a568aca', // null,
        deployment: null,
        latestApiCallsDeployments: []
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
        setDeployment(state, action) {
            return {
                ...state,
                deployment: action.payload.deployment || null,
            };
        },
        pushLatestApiCallsDeployments(state, action) {
            const newCall = action.payload.latestApiCallsDeployments || null;
            const lastCall = state.latestApiCallsDeployments[1];

            // Only push if newCall is not the same as the last one
            if (newCall && JSON.stringify(newCall) !== JSON.stringify(lastCall)) {
                return {
                    ...state,
                    deployment: action.payload.deployment || null,
                    latestApiCallsDeployments: [...state.latestApiCallsDeployments, newCall].slice(-2),
                };
            }
            // Otherwise, keep state unchanged
            return state;
        },
    }
})

export const {
    setStores,
    setSelectedStore,
    setDeployment,
    pushLatestApiCallsDeployments
} = GlobalSlice.actions

export default GlobalSlice.reducer
