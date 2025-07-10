import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';

import './productSearch.css';
import InfoWizard from '../InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';
import { Option, Select, Size } from '@leafygreen-ui/select';
import { SearchInput } from '@leafygreen-ui/search-input';
import { setProductQuery, setSearchType } from '@/redux/slices/ProductInventorySlice';
import ProductScan from '../productScan/ProductScan';
import AtlasSearchLearnMore from './AtlasSearchLearnMore';
import VectorSearchLearnMore from './VectorSearchLearnMore';
import RegexSearchLearnMore from './RegexSearchLearnMore';
import { SEARCH_OPTIONS } from '@/lib/constant';
import HybridSearchLearnMore from './HybridSearchLearnMore';


const ProductSearch = (props) => {
    const dispatch = useDispatch();
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [show, setShow] = useState(false);
    const { query, searchType } = useSelector(state => state.ProductInventory);

    const handleSearch = () => {
        // Placeholder: implement search logic here
        console.log('Searching for:', searchValue);
        if (searchValue.trim() === '') {
            alert('Please enter a search term.');
            return;
        }
        dispatch(setProductQuery({ query: searchValue.trim() }));
    };

    const onKeyDownInput = (e) => {
        if(e.key === 'Enter' && searchValue.length > 0)
            handleSearch()
    }
    
    return (
        <div className="product-search mt-5 mb-5 justify-content-between">
            <ProductScan show={show} setShow={setShow} />
            <div className='d-flex flex-row '>
                <Select
                    className={'me-2'}
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
    )
}

export default ProductSearch