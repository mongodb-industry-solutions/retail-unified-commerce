"use client"
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { fetchBrandAmplifications } from "@/redux/slices/PromotionFormSlice";

const BrandAmplificationLoader = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        console.log('hola')
        //if (!sessionStorage.getItem("brandAmplificationsFetched")) {
            dispatch(fetchBrandAmplifications());
            sessionStorage.setItem("brandAmplificationsFetched", "true");
        //}
    }, [dispatch]);

    return null; // This component does not render anything
};

export default BrandAmplificationLoader;