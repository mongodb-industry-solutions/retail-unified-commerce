'use client'
import React, { useEffect, useState } from 'react';
import { Container } from "react-bootstrap";
import { useSelector, useDispatch } from 'react-redux';
import Icon from '@leafygreen-ui/icon';
import { Tabs, Tab } from '@leafygreen-ui/tabs';
import { H1, Subtitle } from '@leafygreen-ui/typography';
import { useRouter } from 'next/navigation';

import InfoWizard from '@/components/InfoWizard/InfoWizard';
import { productInventoryURL } from '@/lib/constant';
import { getDistancesForOtherStores, getProductDetails, getProductInventory } from '@/lib/api';
import { setProductDetails, setProductInventory } from '@/redux/slices/ProductInventorySlice';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import ProductGeneralDetails from '@/components/productGeneralDetails/ProductGeneralDetails';
import InventoryContainer from '@/components/iventoryContainer/InventoryContainer';
import LocationsContainer from '@/components/locationsContainer/LocationsContainer';
import BusinessIntelligenceContainer from '@/components/businessIntelligence/BusinessIntelligenceContainer';
import { setStores } from '@/redux/slices/GlobalSlice';
import { prodInventoryPage } from '@/lib/talkTrack';
import Card from '@leafygreen-ui/card';
import { CardHeader } from '@/components/cardHeader/CardHeader';

export default function ProductInventoryDetailePage({ params }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const unwrappedParams = React.use(params);
    const { _id } = unwrappedParams;
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false)
    const [selected, setSelected] = useState(0)
    const { productDetails: product } = useSelector(state => state.ProductInventory);
    const { selectedStore } = useSelector(state => state.Global);
    const brandAmplifications = useSelector(state => state.BrandAmplificationForm.brandAmplificationList.data)

    const matchingAmplifications = brandAmplifications?.filter(ba =>
        ba.name === product?.brand &&
        (
            !ba.categories ||
            ba.categories.length === 0 ||
            (product?.category && ba.categories.includes(product?.category))
        )
    );

    useEffect(() => {
        if (!_id || !selectedStore) {
            router.push(productInventoryURL);
            return;
        }

        setLoadingDetails(true);
        dispatch(setProductDetails({ product: null })); // this also resets the inventory
        Promise.all([
            getProductDetails(_id),
            getProductInventory(_id, selectedStore)
        ])
            .then(([product, inventory]) => {
                console.log('Product details:', product);
                console.log('Product inventory:', inventory);
                if (product) dispatch(setProductDetails({ product }));
                if (inventory) dispatch(setProductInventory({ inventory }));
                if (inventory) {
                    getDistancesForOtherStores().then((distances) => {
                        console.log('Distances for other stores:', distances);
                        if (distances) dispatch(setStores({ stores: distances }));
                    })
                }
            })
            .catch((e) => {
                // Optionally handle error
                console.log('Error fetching product details or inventory:', e);
            })
            .finally(() => {
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
                        tabs={prodInventoryPage}
                        openModalIsButton={true}
                    />
                </div>
            </div>

            {
                loadingDetails
                    ? <LoadingSearchBanner title={'Loading details...'} />
                    : product
                        ?
                        <div className='mt-5'>
                            <ProductGeneralDetails productId={_id} />
                            <Tabs aria-label="Product details tabs" className='mt-4' setSelected={setSelected} selected={selected}>
                                <Tab name="Inventory"><InventoryContainer /></Tab>
                                <Tab name="Locations"><LocationsContainer /></Tab>
                                <Tab name="AI Business Intelligence"><BusinessIntelligenceContainer selectedStore={selectedStore} /></Tab>
                                {
                                    // Show Brand Amplification tab if this product was amplified
                                    matchingAmplifications.length > 0 &&
                                    <Tab id='brand-amplification' name="Brand amplification">
                                        <CardHeader
                                            extraClassNames="mt-4"
                                            title="Brand Amplifications"
                                            glyphIcon="Tag"
                                        ></CardHeader>
                                        <p className='medium-text text-dark'>
                                            This product is labeled as a <span style={{ color: "#43a047" }}>Store's favorite</span> because it is boosted by the following brand amplification:
                                        </p>
                                        <div className='mb-4'>
                                            {(!matchingAmplifications || matchingAmplifications.length === 0) ? (
                                                <p>No brand amplifications apply to this product.</p>
                                            ) : (
                                                matchingAmplifications.map((ba, index) => (
                                                    <Card className='mt-3' key={index} onClick={() => console.log(ba)}>
                                                        <p><strong>Brand: </strong>{ba.name}</p>
                                                        <p><strong>Boost Level: </strong>{ba.boostLevel}</p>
                                                        <p><strong>Categories: </strong>{ba.categories ? ba.categories.join(", ") : "All"}</p>
                                                    </Card>
                                                ))
                                            )}
                                        </div>
                                    </Tab>
                                }
                            </Tabs>
                        </div>
                        : null
            }

        </Container>
    );
}
