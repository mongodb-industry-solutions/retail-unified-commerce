import React from 'react'
import { useSelector } from 'react-redux';
import ProductSearch from '../productSearch/ProductSearch'
import { H3 } from '@leafygreen-ui/typography';
import ProductCardSimplify from '../productCard/ProductCardSimplify';
import LoadingSearchBanner from '../loadingSearchBanner/LoadingSearchBanner';
import EnterSearchBanner from '../enterSearchBanner/EnterSearchBannet';
import ErrorSearchBanner from '../errorSearchBanner/EnterSearchBannet';

const TestBrandAmplificationsTab = (props) => {
    const {
        loading,
        error,
        initialLoad,
        resultsWithAmplification,
        resultsWithoutAmplification
    } = useSelector(state => state.BrandAmplificationForm.testBrandAmplifications);
    const { query } = useSelector(state => state.ProductInventory);
    const { onBrandAmplificationClick } = props;

    return (
        <div>
            <ProductSearch isToggleVisible={false} isScanProductVisible={false} />
            <div className='row mb-3'>
                {/* Results with amplification */}
                <div className='col col-50' style={{ borderRight: '1px solid black' }}>
                    <H3 className={'text-center'}>With Amplification</H3>
                </div>
                {/* Results without amplification */}
                <div className='col col-50'>
                    <H3 className={'text-center'}>Without Amplification</H3>
                </div>
            </div>
            <div className='row mb-4'>
                {/* Results with amplification */}
                <div className='col col-50' style={{ borderRight: '1px solid black' }}>
                    {
                        error !== null
                            ? <ErrorSearchBanner error={error} />
                            : initialLoad && !loading
                                ? <EnterSearchBanner />
                                : resultsWithAmplification.length === 0 && !loading && query !== "" && query !== null
                                    ? <div className='text-center'>No results found for "{query}". Please try a different search term.</div>
                                    : resultsWithAmplification.length > 0 && !loading
                                        ? <>
                                            {resultsWithAmplification.map((product, index) => (
                                                <ProductCardSimplify
                                                    key={index}
                                                    product={product}
                                                    onBrandAmplificationClick={onBrandAmplificationClick}
                                                />
                                            ))}
                                        </>
                                        : loading
                                            ? <LoadingSearchBanner />
                                            : <EnterSearchBanner />
                    }
                </div>
                {/* Results without amplification */}
                <div className='col col-50'>
                    {
                        error !== null
                            ? <ErrorSearchBanner error={error} />
                            : initialLoad && !loading
                                ? <EnterSearchBanner />
                                : resultsWithAmplification.length === 0 && !loading && query !== "" && query !== null
                                    ? <div className='text-center'>No results found for "{query}". Please try a different search term.</div>
                                    : resultsWithoutAmplification.length > 0 && !loading
                                        ? <>
                                            {resultsWithoutAmplification.map((product, index) => (
                                                <ProductCardSimplify
                                                    key={index}
                                                    product={product}
                                                    onBrandAmplificationClick={onBrandAmplificationClick}
                                                />
                                            ))}
                                        </>
                                        : loading
                                            ? <LoadingSearchBanner />
                                            : <EnterSearchBanner />
                    }
                </div>
            </div>
        </div>
    )
}

export default TestBrandAmplificationsTab