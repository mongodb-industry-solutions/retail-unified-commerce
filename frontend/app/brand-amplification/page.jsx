'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Container } from "react-bootstrap";
import PageSubheader from '@/components/pageSubheader/PageSubheader';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import BrandAmplificationForm from '@/components/brandAmplificationForm/BrandAmplificationForm';
import { getAllBrands, getProductsWithSearchInput } from '@/lib/api';
import { useDispatch, useSelector } from 'react-redux';
import { removeBrandAmplification, setBrandSelectorError, setBrandSelectorLoading, setTestBrandAmplifications } from '@/redux/slices/PromotionFormSlice';
import TestBrandAmplificationsTab from '@/components/testBrandAmplificationsTab/TestBrandAmplificationsTab';
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';

export default function ProductInventoryPage() {
    const dispatch = useDispatch();
    const {
        query,
        forceSearchWithEnterToggle
    } = useSelector(state => state.ProductInventory);
    const {
        data: brandAmplifications
    } = useSelector(state => state.BrandAmplificationForm.brandAmplificationList)
    const [selected, setSelected] = useState(0);
    const hasMounted = useRef(false);
    const tabs = []


    const deleteBrandAmplification = (baToDelete) => {
        // Remove from localStorage
        let localBrandAmplifications = [];
        try {
            localBrandAmplifications = JSON.parse(localStorage.getItem('brandAmplifications')) || [];
        } catch {
            localBrandAmplifications = [];
        }
        localBrandAmplifications = localBrandAmplifications.filter(
            ba => ba._id !== baToDelete._id // or use ba._id if available
        );
        localStorage.setItem('brandAmplifications', JSON.stringify(localBrandAmplifications));
        // Remove from Redux
        dispatch(removeBrandAmplification({ _id: baToDelete._id }));
    }

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
                <Tab id='create-promotion' name="Create brand amplification"><BrandAmplificationForm onCreateSuccess={() => setSelected(1)} /></Tab>
                <Tab id='active-promotions' name="Active brand amplifications">
                    <div className='mt-4 mb-4'>
                        {
                            brandAmplifications?.map((ba, index) => (
                                <Card className='mt-3' key={index} onClick={() => console.log(ba)}>
                                    <p><strong>Brand: </strong>{ba.name}</p>
                                    <p><strong>Boost Level: </strong>{ba.boostLevel}</p>
                                    <p><strong>Categories: </strong>{ba.categories ? ba.categories.join(", ") : "All"}</p>
                                    {
                                        ba.isLocal && <Button onClick={() => deleteBrandAmplification(ba)}>
                                            Delete
                                        </Button>
                                    }
                                </Card>
                            ))
                        }
                    </div>
                </Tab>
                <Tab id='active-promotions' name="Test brand amplifications"> <TestBrandAmplificationsTab /> </Tab>
            </Tabs>
        </Container>
    );
}
