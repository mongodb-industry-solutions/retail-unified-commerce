import React from 'react'
import { useSelector, useDispatch } from 'react-redux';
import ProductSearch from '../productSearch/ProductSearch'
import ProductCard from '../productCard/ProductCard';
import { H1, H3, Description, Label } from '@leafygreen-ui/typography';
import ProductCardSimplify from '../productCard/ProductCardSimplify';

const TestBrandAmplificationsTab = () => {
    const {
        searchResults,
    } = useSelector(state => state.ProductInventory);
    return (
        <div>
            <ProductSearch isToggleVisible={false} isScanProductVisible={false} />
            <div className='row mb-3'>
                {/* Results with amplification */}
                <div className='col col-50' style={{borderRight: '1px solid black'}}>
                    <H3 className={'text-center'}>With Amplification</H3>
                </div>
                {/* Results with amplification */}
                <div className='col col-50'>
                    <H3 className={'text-center'}>Without Amplification</H3>
                </div>
            </div>
            <div className='row mb-4'>
                {/* Results with amplification */}
                <div className='col col-50' style={{borderRight: '1px solid black'}}>
                    {
                        searchResults.map((product, index) => (
                            <ProductCardSimplify
                                key={index}
                                product={product}
                            />
                        ))
                    }
                </div>
                {/* Results with amplification */}
                <div className='col col-50'>
                    {
                        searchResults.map((product, index) => (
                            <ProductCardSimplify
                                key={index}
                                product={product}
                            />
                        ))
                    }
                </div>
            </div>
        </div>
    )
}

export default TestBrandAmplificationsTab