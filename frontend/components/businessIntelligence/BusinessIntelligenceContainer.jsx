import React from 'react'
import './businessIntelligenceContainer.css';
import { useSelector, useDispatch } from 'react-redux';
import Icon from '@leafygreen-ui/icon';

const BusinessIntelligenceContainer = () => {
    const { productInventory } = useSelector(state => state.ProductInventory);
    const {
        predictedConsumptionPerWeek
    } = productInventory.selectedStoreInventory[0] || {};

    return (
        <div className='mt-4 row'>
            <div className='mb-3'>
                <p className='text-dark mb-0'>
                    <Icon color='#00ee64' glyph="Sparkle" size="large" /> {/* Aisle icon */}
                    <strong>Inventory Predictions</strong>
                </p>
                <p className='medium-text text-dark'>
                    AI-Powered prediction based on historical data.
                </p>
            </div>
            <div className='mb-3'>
                <p className='medium-text text-dark mb-0'>
                    <strong>Restock Frequency: </strong> X
                </p>
                <p className='medium-text text-dark'>
                    Based on the last 12 months of data
                </p>
            </div>
            <div className='mb-3'>
                <p className='medium-text text-dark  mb-0'>
                    <strong>Average Sell-Through Rate: </strong> {predictedConsumptionPerWeek} units per week
                </p>
            </div>
            <div className='mb-3'>
                <p className='medium-text text-dark  mb-0'>
                    <strong>Predicted Stock Depletion: </strong> X
                </p>
                <p className='medium-text text-dark'>
                    Based on current inventory and historical sales data.
                </p>
            </div>
        </div>
    )
}

export default BusinessIntelligenceContainer