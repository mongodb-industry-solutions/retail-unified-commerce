'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Container } from "react-bootstrap";
import PageSubheader from '@/components/pageSubheader/PageSubheader';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import BrandAmplificationForm from '@/components/brandAmplificationForm/BrandAmplificationForm';
import { getProductsWithSearchInput } from '@/lib/api';
import { useDispatch, useSelector } from 'react-redux';
import { setTestBrandAmplifications } from '@/redux/slices/PromotionFormSlice';
import TestBrandAmplificationsTab from '@/components/testBrandAmplificationsTab/TestBrandAmplificationsTab';
import BrandAmplificationList from '@/components/brandAmplificationList/BrandAmplificationList';
import { brandAmplificationPage } from '@/lib/talkTrack';
import { setBrandInForm, setCategoryInForm } from '@/lib/helpers';


export default function ProductInventoryPage() {
    const dispatch = useDispatch();
    const {
        query,
        forceSearchWithEnterToggle
    } = useSelector(state => state.ProductInventory);
    const [selected, setSelected] = useState(0);
    const hasMounted = useRef(false);

    const moveToForm = (brand, category) => {
        setBrandInForm(brand)
        setCategoryInForm(category)
        setSelected(1);
    };

    const fetchResults = async () => {
        if (!query) return;
        dispatch(setTestBrandAmplifications({
            loading: true,
            error: null,
            resultsWithAmplification: [],
            resultsWithoutAmplification: [],
        }));
        try {
            const [resultsWithAmplification, resultsWithoutAmplification] = await Promise.all([
                getProductsWithSearchInput(query, true),
                getProductsWithSearchInput(query, false)
            ]);
            dispatch(setTestBrandAmplifications({
                loading: false,
                error: null,
                resultsWithAmplification: resultsWithAmplification.products || [],
                resultsWithoutAmplification: resultsWithoutAmplification.products || [],
            }));
        } catch (err) {
            dispatch(setTestBrandAmplifications({
                loading: false,
                error: err,
                resultsWithAmplification: [],
                resultsWithoutAmplification: [],
            }));
        }
    };

    useEffect(() => {
        if (!hasMounted.current) {
            hasMounted.current = true;
            return;
        }
        // Only run this after first render
        fetchResults();
    }, [query, forceSearchWithEnterToggle, dispatch]);

    return (
        <Container>
            <PageSubheader
                header="Brand Amplification"
                subtitle="Module for authorized users to amplify brands, increase product relevance, and reach KPIs"
                tabs={brandAmplificationPage}
            />
            <Tabs aria-label="Brand amplification tabs" className='mt-4' setSelected={setSelected} selected={selected}>
                <Tab id='test-promotions' name="Test brand amplifications"> <TestBrandAmplificationsTab onBrandAmplificationClick={moveToForm}/></Tab>
                <Tab id='create-promotion' name="Create brand amplification"><BrandAmplificationForm onCreateSuccess={() => setSelected(2)}/></Tab>
                <Tab id='active-promotions' name="Active brand amplifications"><BrandAmplificationList/></Tab>
            </Tabs>
        </Container>
    );
}
