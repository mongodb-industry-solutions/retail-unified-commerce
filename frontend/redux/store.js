import { configureStore } from '@reduxjs/toolkit';
import AlertReducer from './slices/AlertSlice.js'
import ProductInventoryReducer from './slices/ProductInventorySlice.js';
import GlobalReducer from './slices/GlobalSlice.js';
import BrandAmplificationFormReducer from './slices/PromotionFormSlice.js'

const store = configureStore({
    reducer: {
        "Alerts": AlertReducer,
        "ProductInventory": ProductInventoryReducer,
        "Global": GlobalReducer,
        "BrandAmplificationForm": BrandAmplificationFormReducer
    }
});

export default store;
