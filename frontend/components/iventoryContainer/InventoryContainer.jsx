import React from 'react'
import './inventoryContainer.css';
import { useSelector, useDispatch } from 'react-redux';
import { Description } from '@leafygreen-ui/typography';
import Icon from '@leafygreen-ui/icon';
import ProgressBar from 'react-bootstrap/ProgressBar';

function prettyDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // JS months are 0-based
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

const InventoryContainer = (props) => {
    const { selectedStore } = props;
    const { productInventory: inventory } = useSelector(state => state.ProductInventory);
    console.log('InventoryContainer', inventory);

    if (!selectedStore) {
        return 'no store selected';
    }
    return (
        <div className='mt-4 row'>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Package" size="large" /> {/* Aisle icon */}
                        Shelf inventory
                    </p>
                    <h2>{inventory.storeInventory.shelfQuantity}</h2>
                    <div style={{ width: '80%' }}>
                        <ProgressBar now={60} />
                    </div>
                    <Description className="medium-text">X of X units</Description>
                </div>
            </div>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Package" size="large" /> {/* Aisle icon */}
                        Backroom inventory
                    </p>
                    <h2>{inventory.storeInventory.backroomQuantity}</h2>
                    <div style={{ width: '80%' }}>
                        <ProgressBar now={60} />
                    </div>
                    <Description className="medium-text">X of X units</Description>
                </div>
            </div>
            <div className='col-4 col-md-4 col-sm-12 col-12 mb-4'>
                <div className='d-flex flex-column'>
                    <p>
                        <Icon glyph="Calendar" size="large" /> {/* Aisle icon */}
                        Next restock
                    </p>
                    <h2>{prettyDate(inventory.storeInventory.nextRestock)}</h2>
                    <Description className="medium-text">Expecting: X units</Description>
                </div>
            </div>
        </div>
    )
}

export default InventoryContainer