'use client'
import React, { useState, useEffect } from 'react';
import { Container } from "react-bootstrap";
import PageSubheader from '@/components/pageSubheader/PageSubheader';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import PromotionForm from '@/components/promotionForm/PromotionForm';
import { getAllBrands } from '@/lib/api';
import { useDispatch, useSelector } from 'react-redux';
import { setBrandSelectorError, setBrandSelectorLoading } from '@/redux/slices/PromotionFormSlice';

export default function ProductInventoryPage() {
    const [selected, setSelected] = useState(0);
    const dispatch = useDispatch();
    const tabs = []

    useEffect(() => {
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
    }, [])

    return (
        <Container>
            <PageSubheader
                tabs={tabs}
                header="Brand Amplification"
                subtitle="Module for managers to amplify brands, increase product relevance, and reach KPIs"
            />
            <Tabs aria-label="Brand amplification tabs" className='mt-4' setSelected={setSelected} selected={selected}>
                <Tab id='create-promotion' name="Create brand amplification"><PromotionForm /></Tab>
                <Tab id='active-promotions' name="Active brand amplifications"></Tab>
            </Tabs>
        </Container>
    );
}
