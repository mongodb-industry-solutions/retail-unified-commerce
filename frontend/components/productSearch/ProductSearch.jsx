import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';

import './productSearch.css';
import InfoWizard from '../InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';
import { Option, Select, Size } from '@leafygreen-ui/select';
import { SearchInput } from '@leafygreen-ui/search-input';
import { setProductQuery } from '@/redux/slices/ProductInventorySlice';


const ProductSearch = (props) => {
    const dispatch = useDispatch();
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const query = useSelector(state => state.ProductInventory.query);

    const handleSearch = () => {
        // Placeholder: implement search logic here
        console.log('Searching for:', searchValue);
        if (searchValue.trim() === '') {
            alert('Please enter a search term.');
            return;
        }
        dispatch(setProductQuery({ query: searchValue.trim() }));
    };

    return (
        <div className="product-search mt-5 mb-5 justify-content-between">

            <div className='d-flex flex-row '>
                <Select
                    className={'me-2'}
                    aria-label="Search type"
                    name="Search Type"
                    size={Size.Default}
                    defaultValue={"search"}
                >
                    <Option value="search" description="Full-text search">
                        Atlas Search
                    </Option>
                    <Option value="vector-search" description="Semantic search with vector embeddings">
                        Atlas Vector Search
                    </Option>
                </Select>
                <SearchInput
                    className={'search-input'}
                    defaultValue={query || ''} // Use query from Redux state or empty string
                    value={searchValue} // Controlled value
                    onChange={e => setSearchValue(e.target.value)} // Update state
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
                    tooltipText="Talk track!"
                    iconGlyph="Wizard"
                    sections={[]}
                    openModalIsButton={false}
                />
            </div>
            <div>
                <Button leftGlyph={<Icon glyph={"Stitch"} />}>
                    Scan Product
                </Button>
            </div>


        </div>
    )
}

export default ProductSearch