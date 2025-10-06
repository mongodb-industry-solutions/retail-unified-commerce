import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux';

import './productSearch.css';
import InfoWizard from '../InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';
import { Option, Select } from '@leafygreen-ui/select';
import { SearchInput } from '@leafygreen-ui/search-input';
import { setFusionMode, setProductQuery, setSearchType, setSearchWeight, setUseBrandAmplification, setVectorSearchWeight, toggleForceSearchWithEnter } from '@/redux/slices/ProductInventorySlice';
import ProductScan from '../productScan/ProductScan';
import AtlasSearchLearnMore from './AtlasSearchLearnMore';
import VectorSearchLearnMore from './VectorSearchLearnMore';
import RegexSearchLearnMore from './RegexSearchLearnMore';
import { SEARCH_FUSION_OPTIONS, SEARCH_OPTIONS } from '@/lib/constant';
import HybridSearchLearnMore from './HybridSearchLearnMore';
import { NumberInput } from '@leafygreen-ui/number-input';
import toast from 'react-hot-toast';
import { validateHybridSearchParameters } from '@/lib/helpers';
import { RadioBox, RadioBoxGroup } from '@leafygreen-ui/radio-box-group';
import ExpandableCard from '@leafygreen-ui/expandable-card';
import Card from '@leafygreen-ui/card';
import Toggle from '@leafygreen-ui/toggle';
import { CardHeader } from '../cardHeader/CardHeader';
import { Label } from '@leafygreen-ui/typography';
import { InfoSprinkle } from '@leafygreen-ui/info-sprinkle';

const ProductSearch = (props) => {
    const { isToggleVisible = true, isScanProductVisible = true } = props
    const dispatch = useDispatch();
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [searchValue, setSearchValue] = useState('');
    const [show, setShow] = useState(false);
    const {
        query,
        searchType,
        vectorSearchWeight,
        searchWeight,
        fusionMode,
        useBrandAmplification
    } = useSelector(state => state.ProductInventory);

    const handleSearch = () => {
        // Placeholder: implement search logic here
        console.log('Searching for:', searchValue);
        if (searchValue.trim() === '') {
            toast.error('Please enter a search term.');
            return;
        }
        if (searchType === SEARCH_OPTIONS.hybridSearch.id) { // user is executing hybrid search
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
        <div className={`d-flex flex-column ${isToggleVisible == true ? 'mt-5' : 'mt-4'} ${searchType === SEARCH_OPTIONS.hybridSearch.id ? '' : 'mb-2'}`}>
            <Card className='mb-2'>
                <CardHeader
                    title="Search Configuration"
                    glyphIcon="SearchIndex"
                    rightElement={
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
                                {
                                    heading: "Regex Search",
                                    content: <RegexSearchLearnMore />
                                }
                            ]}
                            openModalIsButton={false}
                        />}
                />
                <div className='d-flex flex-col'>
                    <Select
                        className={'search-selector me-4'}
                        label="Search type"
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
                            Object.values(SEARCH_OPTIONS)
                                .filter(option => option.enabled)
                                .map(option => (
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
                    {
                        isToggleVisible &&
                        <div className='d-flex flex-column'>
                            <div className='d-flex align-items-center mb-1'>
                                <Label className={'mb-1 me-1'}>Use Brand Amplifications</Label>
                                <InfoSprinkle
                                    triggerProps={{
                                        onMouseDown: () => { },
                                        onMouseOver: () => { },
                                        'aria-label': 'aria-label',
                                    }}>
                                    Amplified products will have a light green background in the results list.
                                </InfoSprinkle>
                            </div>
                            <Toggle
                                id="toggle"
                                aria-labelledby="label"
                                label="Use Brand Amplifications"
                                checked={useBrandAmplification}
                                onChange={(checked, event) => {
                                    dispatch(setUseBrandAmplification({ useBrandAmplification: checked })) // to force a re-render
                                }}
                            />
                        </div>
                    }
                </div>
                {
                    searchType === SEARCH_OPTIONS.hybridSearch.id &&
                    <ExpandableCard
                        className='mt-3'
                        title="Hybrid search settings"
                        description="Expand to fine-tune the balance between semantic relevance and keyword matching."
                        flagText="Fusion mode and weights"
                    >
                        <div>
                            <RadioBoxGroup
                                size="compact"
                                className="radio-box-group-style"
                                value={fusionMode}
                            >
                                {
                                    Object.values(SEARCH_FUSION_OPTIONS).map((option) => (
                                        <RadioBox
                                            key={option.id}
                                            value={option.id}
                                            onClick={() => {
                                                dispatch(setFusionMode({ fusionMode: option.id }))
                                            }}
                                        >
                                            {option.label}
                                        </RadioBox>
                                    ))
                                }
                            </RadioBoxGroup>
                        </div>
                        <div className='d-flex flex-row align-items-center mt-3'>
                            <NumberInput
                                className='weight-input'
                                label=""
                                description="Vector Search Weight"
                                min={0}
                                max={1}
                                value={vectorSearchWeight}
                                onChange={(e) => dispatch(setVectorSearchWeight({ vectorSearchWeight: e.target.value }))}
                            />
                            <NumberInput
                                className='weight-input ms-1'
                                label=""
                                description="Search Weight"
                                min={0}
                                max={1}
                                value={searchWeight}
                                onChange={(e) => dispatch(setSearchWeight({ searchWeight: e.target.value }))}
                            />
                        </div>
                        <div className='mt-3 mb-3'>
                            In <code>$rankFusion</code>, rankings are influenced by pipeline weights. In <code>$scoreFusion</code>, weights control the contribution of each pipeline's scores to the final result
                        </div>
                    </ExpandableCard>

                }
            </Card>
            <div className='product-search mb-2 mt-2 justify-content-between'>
                <ProductScan show={show} setShow={setShow} />
                <div className='d-flex flex-row '>
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
                </div>
                {
                    isScanProductVisible &&
                    <Button
                        leftGlyph={<Icon glyph={"Stitch"} />}
                        onClick={() => setShow(true)}
                    >
                        Scan Product
                    </Button>
                }

            </div>
        </div>
    )
}

export default ProductSearch