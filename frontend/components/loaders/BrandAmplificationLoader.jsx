"use client"
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { fetchBrandAmplifications, setBrandSelectorError, setBrandSelectorLoading } from "@/redux/slices/PromotionFormSlice";
import { getAllBrands } from "@/lib/api";

const BrandAmplificationLoader = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        console.log('fetching brand amplifications')
        //if (!sessionStorage.getItem("brandAmplificationsFetched")) {
        dispatch(fetchBrandAmplifications());
        sessionStorage.setItem("brandAmplificationsFetched", "true");
        //}
    }, [dispatch]);

    useEffect(() => {
        console.log('fetching brands')
        //load all brand names for the form selector
        getAllBrands().then(res => {
            console.log(res)
        })
            .catch(err => {
                dispatch(setBrandSelectorError({ error: err }))
            })
            .finally(() => {
                dispatch(setBrandSelectorLoading({ loading: false }))
            })
    }, [dispatch]);

    return null; // This component does not render anything
};

export default BrandAmplificationLoader;