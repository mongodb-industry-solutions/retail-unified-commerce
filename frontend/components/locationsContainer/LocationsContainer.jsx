import React, { useEffect, useState } from 'react'
import './locationsContainer.css';
import { useSelector, useDispatch } from 'react-redux';
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

const calculateStockLevel = (shelfQuantity = 0, backroomQuantity = 0) => {
    const amount = Number(shelfQuantity) + Number(backroomQuantity);
    const text = amount < 0 ? 'Out of Stock' : amount <= 10 ? 'Low In Stock' : 'In Stock';    
    const color = amount < 0 ? 'red' : amount <= 10 ? 'yellow' : 'green';
    return {color, text}
}

const LocationsContainer = (props) => {
    const { selectedStore } = props;
    const { inventorySummary: productInventorySummary } = useSelector(state => state.ProductInventory.productDetails) || [];
    const { productInventory: inventory } = useSelector(state => state.ProductInventory);
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
                        <p className='mb-0'>
                            {
                                inventory.storeInventory
                                    ? inventory.storeInventory.sectionId
                                    : 'N/A'
                            }
                        </p>

                    </div>
                    <div className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Aisle:</p>
                        <p className='mb-0'>
                            {
                                inventory.storeInventory
                                    ? inventory.storeInventory.aisleId
                                    : 'N/A'
                            }
                        </p>
                    </div>
                    <div className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Shelf:</p>
                        <p className='mb-0'>
                           {
                                inventory.storeInventory
                                    ? inventory.storeInventory.shelfId
                                    : 'N/A'
                            }
                        </p>
                    </div>
                </div>
            </Card>
            <Card className='mb-4 '>
                <p className='medium-text text-dark mb-1'>
                    <Icon glyph="Pin" size="large" /> {/* Aisle icon */}
                    <strong>Store Map</strong>
                </p>
                <Description className='medium-text mt-0'>See product location on the store map</Description>
                    {
                        inventory.storeInventory
                            ? 'MAP'
                            : 'N/A'
                    }
            </Card>
            <Card className='mb-4'>
                <p className='medium-text text-dark'>
                    <Icon glyph="Building" size="large" /> {/* Aisle icon */}
                    <strong>Other Store Availability</strong>
                </p>
                <Table>
                    <TableHead>
                        <HeaderRow>
                            <HeaderCell>Store</HeaderCell>
                            <HeaderCell>Distance</HeaderCell>
                            <HeaderCell>Availability</HeaderCell>
                            <HeaderCell>Quantity</HeaderCell>
                        </HeaderRow>
                    </TableHead>
                    <TableBody>
                        {productInventorySummary && productInventorySummary?.map((store, rowIndex) => (
                            <Row key={store.storeId}>
                                <Cell>{store.storeId}</Cell>
                                <Cell>TODO</Cell>
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