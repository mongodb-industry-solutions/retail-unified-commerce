'use client'
import React, { useState, useEffect } from 'react';
import { Container } from "react-bootstrap";
import PageSubheader from '@/components/pageSubheader/PageSubheader';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import PromotionForm from '@/components/promotionForm/PromotionForm';

export default function ProductInventoryPage() {
    const [selected, setSelected] = useState(0)
    const tabs = []

    useEffect(() => {
      //load all brand names for the form selector

    }, [])
    

    return (
        <Container>
            <PageSubheader
                tabs={tabs}
                header="Brand Amplification"
                subtitle="Create brand amplifications to boost products relevance and reach KPIs"
            />
            <Tabs aria-label="Brand amplification tabs" className='mt-4' setSelected={setSelected} selected={selected}>
                <Tab id='create-promotion' name="Create brand amplification"><PromotionForm /></Tab>
                <Tab id='active-promotions' name="Active brand amplifications"></Tab>
            </Tabs>
        </Container>
    );
}
