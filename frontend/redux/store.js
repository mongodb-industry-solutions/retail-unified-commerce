import { configureStore } from '@reduxjs/toolkit';
import AlertReducer from './slices/AlertSlice.js'

const store = configureStore({
    reducer: {
        "Alerts": AlertReducer
    }
});

export default store;
