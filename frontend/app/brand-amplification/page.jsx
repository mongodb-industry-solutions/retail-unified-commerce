'use client'
import React, { useState, useEffect } from 'react';
import { Container } from "react-bootstrap";
import PageSubheader from '@/components/pageSubheader/PageSubheader';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import BrandAmplificationForm from '@/components/brandAmplificationForm/BrandAmplificationForm';
import { getAllBrands } from '@/lib/api';
import { useDispatch } from 'react-redux';
import { setBrandSelectorError, setBrandSelectorLoading } from '@/redux/slices/PromotionFormSlice';
import TestBrandAmplificationsTab from '@/components/testBrandAmplificationsTab/TestBrandAmplificationsTab';

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
                <Tab id='create-promotion' name="Create brand amplification"><BrandAmplificationForm /></Tab>
                <Tab id='active-promotions' name="Active brand amplifications"></Tab>
                <Tab id='active-promotions' name="Test brand amplifications"> <TestBrandAmplificationsTab/> </Tab>
            </Tabs>
        </Container>
    );
}
