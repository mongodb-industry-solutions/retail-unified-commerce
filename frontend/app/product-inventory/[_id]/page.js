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
import { getDistancesForOtherStores, getProductDetails, getProductInventory } from '@/lib/api';
import { setProductDetails, setProductInventory } from '@/redux/slices/ProductInventorySlice';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import ProductGeneralDetails from '@/components/productGeneralDetails/ProductGeneralDetails';
import InventoryContainer from '@/components/iventoryContainer/InventoryContainer';
import LocationsContainer from '@/components/locationsContainer/LocationsContainer';
import BusinessIntelligenceContainer from '@/components/businessIntelligence/BusinessIntelligenceContainer';
import { setStores } from '@/redux/slices/GlobalSlice';
import HowToInventoryPage from '@/components/talkTracks/HowToInventoryPage';
import BehindTheScenes from '@/components/talkTracks/BehindTheScenes';
import ProductInventoryWyMDB from '@/components/talkTracks/ProductInventoryWyMDB';

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
                        tabs={[
                            {
                                heading: 'How to demo',
                                content: <HowToInventoryPage isSearchPage={false} />
                            },
                            {
                                heading: 'Behind the scenes',
                                content: <BehindTheScenes />
                            },
                            {
                                heading: 'Why MongoDB?',
                                content: <ProductInventoryWyMDB />
                            }
                        ]}
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
                            </Tabs>
                        </div>
                        : null
            }

        </Container>
    );
}
