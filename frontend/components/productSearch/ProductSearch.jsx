import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';

import './productSearch.css';
import InfoWizard from '../InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';
import { Option, Select } from '@leafygreen-ui/select';
import { SearchInput } from '@leafygreen-ui/search-input';
import { setProductQuery, setSearchType, setSearchWeight, setVectorSearchWeight, toggleForceSearchWithEnter } from '@/redux/slices/ProductInventorySlice';
import ProductScan from '../productScan/ProductScan';
import AtlasSearchLearnMore from './AtlasSearchLearnMore';
import VectorSearchLearnMore from './VectorSearchLearnMore';
import RegexSearchLearnMore from './RegexSearchLearnMore';
import { SEARCH_OPTIONS } from '@/lib/constant';
import HybridSearchLearnMore from './HybridSearchLearnMore';
import { NumberInput } from '@leafygreen-ui/number-input';
import toast from 'react-hot-toast';
import { validateHybridSearchParameters } from '@/lib/helpers';

const ProductSearch = () => {
    const dispatch = useDispatch();
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [show, setShow] = useState(false);
    const { 
        query, 
        searchType,
        vectorSearchWeight,
        searchWeight
    } = useSelector(state => state.ProductInventory);

    console.log('ProductSearch:', vectorSearchWeight, searchWeight);

    const handleSearch = () => {
        // Placeholder: implement search logic here
        console.log('Searching for:', searchValue);
        if (searchValue.trim() === '') {
            toast.error('Please enter a search term.');
            return;
        }
        if (searchType === SEARCH_OPTIONS.hybridSearch.id ) { // user is executing hybrid search
            const validParams = validateHybridSearchParameters(vectorSearchWeight, searchWeight);
            if (!validParams) {
                return; // Stop execution if validation fails
            }
        }
        dispatch(setProductQuery({ query: searchValue.trim() }));
        dispatch(toggleForceSearchWithEnter());
    };

    const onKeyDownInput = (e) => {
        if (e.key === 'Enter' && searchValue.trim() !== '') {
            dispatch(setProductQuery({ query: searchValue.trim() }));
            dispatch(toggleForceSearchWithEnter());
        }
    }

    return (
        <div className="d-flex flex-column mt-5 mb-5 ">
            <div className='product-search mb-1 justify-content-between'>
                <ProductScan show={show} setShow={setShow} />
                <div className='d-flex flex-row '>
                    <Select
                        className={'search-selector me-2'}
                        aria-label="Search type"
                        name="Search Type"
                        defaultValue={searchType || 1}
                        value={searchType}
                        onChange={value => {
                            if (value === '') return; // Prevent setting empty value
                            console.log('Selected search type:', value);
                            dispatch(setSearchType({ searchType: value }));
                        }}
                    >
                        {
                            Object.values(SEARCH_OPTIONS).map(option => (
                                <Option
                                    className='search-option'
                                    key={option.id}
                                    value={option.id}
                                    description={option.description}
                                >
                                    {option.label}
                                </Option>))
                        }
                    </Select>
                    <SearchInput
                        className={'search-input'}
                        defaultValue={query || ''} // Use query from Redux state or empty string
                        value={searchValue} // Controlled value
                        onChange={e => setSearchValue(e.target.value)} // Update state
                        onKeyDown={(e) => onKeyDownInput(e)}
                        aria-label="some label"
                        placeholder='Search product by name, SKU or description'
                    ></SearchInput>
                    <Button
                        className="ms-2"
                        variant="primary"
                        onClick={handleSearch}
                    >
                        Search
                    </Button>

                    <InfoWizard
                        open={openHelpModal}
                        setOpen={setOpenHelpModal}
                        tooltipText="Learn more!"
                        iconGlyph="Wizard"
                        tabs={[
                            {
                                heading: "Atlas Search",
                                content: <AtlasSearchLearnMore />
                            },
                            {
                                heading: "Vector Search",
                                content: <VectorSearchLearnMore />
                            },
                            {
                                heading: "Hybrid Search",
                                content: <HybridSearchLearnMore />
                            },
                            //                         {
                            //     heading: "Hybrid Search + Rerank",
                            //     content: <VectorSearchLearnMore />
                            // },
                            {
                                heading: "Regex Search",
                                content: <RegexSearchLearnMore />
                            }
                        ]}
                        openModalIsButton={false}
                    />
                </div>
                <div>
                    <Button
                        leftGlyph={<Icon glyph={"Stitch"} />}
                        onClick={() => setShow(true)}
                    >
                        Scan Product
                    </Button>
                </div>
            </div>
            {
                searchType === SEARCH_OPTIONS.hybridSearch.id &&
                <div className='d-flex flex-row align-items-center mt-3'>
                    <NumberInput
                        className='weight-input'
                        label=""
                        description="Vector Search Weight"
                        min={0}
                        max={1}
                        value={vectorSearchWeight}
                        onChange={(e) =>dispatch(setVectorSearchWeight({ vectorSearchWeight: e.target.value }))}
                    />
                    <NumberInput
                        className='weight-input ms-1'
                        label=""
                        description="Search Weight"
                        min={0}
                        max={1}
                        value={searchWeight}
                        onChange={(e) =>dispatch(setSearchWeight({ searchWeight: e.target.value }))}
                    />
                </div>
            }
        </div>
    )
}

export default ProductSearch