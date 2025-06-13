'use client'
import React, { useEffect, useState } from 'react';
import { Container } from "react-bootstrap";
import { useSelector, useDispatch } from 'react-redux';
import Icon from '@leafygreen-ui/icon';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import { H1, H3, Subtitle } from '@leafygreen-ui/typography';
import { useRouter } from 'next/navigation';

import InfoWizard from '@/components/InfoWizard/InfoWizard';
import { productInventoryURL } from '@/lib/constant';
import { getProductDetails } from '@/lib/api';
import { setProductDetails } from '@/redux/slices/ProductInventorySlice';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import ProductGeneralDetails from '@/components/productGeneralDetails/ProductGeneralDetails';
import InventoryContainer from '@/components/iventoryContainer/InventoryContainer';

export default function ProductInventoryDetailePage({ params }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const unwrappedParams = React.use(params);
    const { _id } = unwrappedParams;
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false)
    const [selected, setSelected] = useState(0)
    const { productDetails: product } = useSelector(state => state.ProductInventory);

    useEffect(() => {
        if (!_id) {
            router.push(productInventoryURL);
            return;
        }
        setLoadingDetails(true);
        dispatch(setProductDetails({ product: null }));
        getProductDetails(_id)
            .then(product => {
                console.log('Product details fetched:', product);
                if (product)
                    dispatch(setProductDetails({ product: product }));
            })
            .catch(() => {
                // Optionally handle error (e.g., redirect or show error)
            }).finally(() => {
                setLoadingDetails(false);
            });
    }, [_id, dispatch, router]);


    return (
        <Container>
            <div className='d-flex w-100 justify-content-between'>
                <div
                    className='d-flex align-items-center'
                    style={{ cursor: 'pointer', gap: 6 }}
                    onClick={() => router.push(productInventoryURL)}
                >
                    <Icon glyph="ArrowLeft" size="large" />
                    <span>Back</span>
                </div>
                <div>
                    <H1 className={'text-center'}>Product Details</H1>
                    <Subtitle className={'text-center'}>Detailed inventory information</Subtitle>
                </div>
                <div>
                    <InfoWizard
                        open={openHelpModal}
                        setOpen={setOpenHelpModal}
                        tooltipText="Talk track!"
                        iconGlyph="Wizard"
                        sections={[]}
                        openModalIsButton={true}
                    />
                </div>
            </div>

            {
                loadingDetails
                    ? <LoadingSearchBanner title={'Loading details...'} />
                    : product
                    ? <div className='mt-5'>
                        <ProductGeneralDetails />
                        <Tabs className='mt-4' setSelected={setSelected} selected={selected}>
                            <Tab name="Inventory"><InventoryContainer/></Tab>
                            <Tab name="Locations">Comming soon...</Tab>
                            <Tab name="AI Business Intelligence">Comming soon...</Tab>
                        </Tabs>
                    </div>
                    : null
            }

        </Container>
    );
}
