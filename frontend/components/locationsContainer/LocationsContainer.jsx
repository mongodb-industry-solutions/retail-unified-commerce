'use client'
import React, { useEffect, useState } from 'react'
import './locationsContainer.css';
import { useSelector } from 'react-redux';
import { Description } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import Card from '@leafygreen-ui/card';
import Badge from '@leafygreen-ui/badge';
import {
    Cell,
    HeaderCell,
    HeaderRow,
    Row,
    Table,
    TableBody,
    TableHead,
} from '@leafygreen-ui/table';
import StoreDistanceContainer from './StoreDistanceContainer';
import Image from 'next/image';


const calculateStockLevel = (shelfQuantity = 0, backroomQuantity = 0) => {
    const amount = Number(shelfQuantity) + Number(backroomQuantity);
    const text = amount < 0 ? 'Out of Stock' : amount <= 10 ? 'Low In Stock' : 'In Stock';
    const color = amount < 0 ? 'red' : amount <= 40 ? 'yellow' : 'green';
    return { color, text }
}

const getStoreDistance = (stores, storeObjectId) => {
    const distance = stores.find(store => store._id === storeObjectId)?.distanceInKM;
    return distance ? `${distance.toFixed(2)} km` : 'N/A';
}

const LocationsContainer = () => {
    const { selectedStore, stores } = useSelector(state => state.Global);
    const { productInventory: inventory } = useSelector(state => state.ProductInventory);
    const { otherStoreInventory } = inventory || [];
    // Sort otherStoreInventory by distance
    const sortedOtherStoreInventory = [...(otherStoreInventory || [])].sort((a, b) => {
        const distA = parseFloat(getStoreDistance(stores, a.storeObjectId)) || Infinity;
        const distB = parseFloat(getStoreDistance(stores, b.storeObjectId)) || Infinity;
        return distA - distB
    });
    const {
        sectionId = 'N/A',
        aisleId = 'N/A',
        shelfId = 'N/A',
    } = inventory.selectedStoreInventory?.[0] || {};

    const [loading, setLoading] = useState(true)


    if (!selectedStore) {
        return 'no store selected';
    }
    return (
        <div className='mt-4 row'>
            <Card className='mb-4'>
                <p className='medium-text text-dark'>
                    <Icon glyph="Package" size="large" /> {/* Aisle icon */}
                    <strong>Shelf Inventory</strong>
                </p>
                <div className='row'>
                    <div className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Section:</p>
                        <p className='mb-0'> {sectionId}  </p>

                    </div>
                    <div className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Aisle:</p>
                        <p className='mb-0'> {aisleId} </p>
                    </div>
                    <div className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Shelf:</p>
                        <p className='mb-0'> {shelfId} </p>
                    </div>
                </div>
            </Card>
            <Card className='mb-4 '>
                <p className='medium-text text-dark mb-1'>
                    <Icon glyph="Pin" size="large" /> {/* Aisle icon */}
                    <strong>Store Map</strong>
                </p>
                <Description className='medium-text mt-0'>See product location on the store map</Description>
                <div className='d-flex justify-content-center align-items-center mb-2'>
                    <Image
                        src={`/images/florMap/${!aisleId || aisleId === 'N/A' ? 'floorMap' : aisleId}.png`}
                        alt="floor map"
                        width={400}
                        height={250}
                        priority
                        onError={() => setMapSrc('/images/florMap/floorMap.png')}
                    ></Image>
                </div>
            </Card>
            <Card className='mb-4'>
                <p className='medium-text text-dark'>
                    <Icon glyph="Building" size="large" /> {/* Aisle icon */}
                    <strong>Other Store Availability</strong>
                    {/* Esta seccion se toma de la collection Inventory */}
                </p>
                <Table shouldAlternateRowColor={true} shouldTruncate={false} >
                    <TableHead>
                        <HeaderRow>
                            <HeaderCell>Distance</HeaderCell>
                            <HeaderCell>Store</HeaderCell>
                            <HeaderCell>Availability</HeaderCell>
                            <HeaderCell>Quantity</HeaderCell>
                        </HeaderRow>
                    </TableHead>
                    <TableBody>
                        {sortedOtherStoreInventory && sortedOtherStoreInventory?.map((store, rowIndex) => (
                            <Row key={store.storeObjectId}>
                                <Cell>
                                    <div className='d-flex align-items-center justify-content-between gap-1'>
                                        <StoreDistanceContainer store={store} getStoreDistance={getStoreDistance} />
                                    </div>
                                </Cell>
                                <Cell>{store.storeName}</Cell>
                                <Cell>
                                    <Badge variant={calculateStockLevel(store.shelfQuantity, store.backroomQuantity).color} className="my-badge">
                                        {calculateStockLevel(store.shelfQuantity, store.backroomQuantity).text}
                                    </Badge>
                                </Cell>
                                <Cell>{Number(store.shelfQuantity || 0) + Number(store.backroomQuantity || 0)}</Cell>
                            </Row>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    )
}

export default LocationsContainer