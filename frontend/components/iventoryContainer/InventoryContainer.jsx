import React from 'react'
import './inventoryContainer.css';
import { Description } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import ProgressBar from 'react-bootstrap/ProgressBar';


const InventoryContainer = (props) => {
    const { } = props;

    return (
        <div className='mt-4 row'>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Package" size="small" /> {/* Aisle icon */}
                        Shelf inventory
                    </p>
                    <h2>12</h2>
                    <div style={{ width: '80%' }}>
                        <ProgressBar now={60} />
                    </div>
                    <Description className="medium-text">12 of 24 units</Description>
                </div>
            </div>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Package" size="small" /> {/* Aisle icon */}
                        Backroom inventory
                    </p>
                    <h2>12</h2>
                    <div style={{ width: '80%' }}>
                        <ProgressBar now={60} />
                    </div>
                    <Description className="medium-text">12 of 24 units</Description>
                </div>
            </div>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Calendar" size="small" /> {/* Aisle icon */}
                        Next restock
                    </p>
                    <h2>12</h2>
                    <div style={{ width: '80%' }}>
                        <ProgressBar now={60} />
                    </div>
                    <Description className="medium-text">12 of 24 units</Description>
                </div>
            </div>
        </div>
    )
}

export default InventoryContainer