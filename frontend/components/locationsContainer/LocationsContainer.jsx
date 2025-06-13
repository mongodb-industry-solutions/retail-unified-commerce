import React from 'react'
import './locationsContainer.css';
import { Description } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import Card from '@leafygreen-ui/card';

const LocationsContainer = (props) => {
    const { } = props;

    return (
        <div className='mt-4 row'>
            <Card className='mb-4'>
                <p className='medium-text text-dark'>
                    <Icon glyph="Package" size="small" /> {/* Aisle icon */}
                    <strong>Shelf Inventory</strong>
                </p>
                <div className='row'>
                    <div  className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Aisle:</p>
                        <p className='mb-0'>D3</p>

                    </div>
                    <div  className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Section:</p>
                        <p className='mb-0'>Dairy</p>

                    </div>
                    <div  className='col-4 col-md-4 col-sm-12 col-12 mb-4 d-flex flex-column align-items-center'>

                        <p className='m-0 medium-text text-dark'>Aisle:</p>
                        <p className='mb-0'>Middle</p>

                    </div>
                </div>
            </Card>
            <Card className='mb-4 '>
                <p className='medium-text text-dark mb-1'>
                    <Icon glyph="MagnifyingGlass" size="small" /> {/* Aisle icon */}
                    <strong>Store Map</strong>
                </p>
                <Description className='medium-text mt-0'>See product location on the store map</Description>
            </Card>
            <Card className='mb-4'>
                <p className='medium-text text-dark'>
                    <Icon glyph="Building" size="small" /> {/* Aisle icon */}
                    <strong>Other Store Availability</strong>
                </p>
            </Card>
        </div>
    )
}

export default LocationsContainer