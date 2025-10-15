import store from "@/redux/store";
import { brandAmplificationGetSearchMeta } from "./api";
import { setBrand, setBrandAmplificationField } from "@/redux/slices/PromotionFormSlice";

export const prettifyDateFormat = (timestamp) => {
    const date = new Date(timestamp);
    // Format the date part (e.g., "Jan 1, 2000")
    const datePart = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
    // Format the time part (e.g., "12:00:00 AM")
    const timePart = date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    return `${datePart} at ${timePart}`;
}


export const validateHybridSearchParameters = (vsWeight, hsWeight) => {
    if (Number(vsWeight) + Number(hsWeight) !== 1) {
        toast.error('The sum of Vector Search Weight and Search Weight must equal  to one.');
        return false; // Return false if validation fails
    }
    return true; // Return true if valid, false otherwise
};

export const setBrandInForm = async (brandId = null) => {
    const brand = store.getState('BrandAmplificationForm').BrandAmplificationForm.brandSelector.data.find(brand => brand._id === brandId);
    store.dispatch(setBrand({ brand: brand?._id, categories: brand?.categories }))
    await brandAmplificationGetSearchMeta()
}

export const setCategoryInForm = async (value) => {
    if (value === "") {
        store.dispatch(setBrandAmplificationField({ field: "categories", value: [] }))
        await brandAmplificationGetSearchMeta()
        return
    }
    const brandAmplification = store.getState('BrandAmplificationForm').BrandAmplificationForm.brandAmplification;
    if (value == "") return;
    const arr = Array.isArray(brandAmplification["categories"]) ? brandAmplification["categories"] : [];
    const exists = arr.includes(value);
    if (exists) {
        store.dispatch(setBrandAmplificationField({ field: "categories", value: arr.filter((item) => item !== value) }))
    }
    else {
       store.dispatch(setBrandAmplificationField({ field: "categories", value: [value] }))
    }
    await brandAmplificationGetSearchMeta()
};