import { configureStore } from '@reduxjs/toolkit';
import AlertReducer from './slices/AlertSlice.js'
import ProductInventoryReducer from './slices/ProductInventorySlice.js';

const store = configureStore({
    reducer: {
        "Alerts": AlertReducer,
        "ProductInventory": ProductInventoryReducer
    }
});

export default store;
