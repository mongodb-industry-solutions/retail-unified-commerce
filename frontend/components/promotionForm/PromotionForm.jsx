import React, { } from 'react'
import './promotionForm.css'
import Card from '@leafygreen-ui/card';
import { CardHeader } from '../cardHeader/CardHeader';
import { Combobox, ComboboxOption } from '@leafygreen-ui/combobox';
import { Select, Option } from "@leafygreen-ui/select";
import TextInput from "@leafygreen-ui/text-input";
import Button from '@leafygreen-ui/button';
import ExpandableCard from '@leafygreen-ui/expandable-card';
import Code from '@leafygreen-ui/code'
import { useDispatch, useSelector } from 'react-redux';
import { Description } from '@leafygreen-ui/typography';
import { setBrand, setBrandAmplificationField } from '@/redux/slices/PromotionFormSlice';
import Badge from '@leafygreen-ui/badge';
import IconButton from '@leafygreen-ui/icon-button';
import X from "@leafygreen-ui/icon/dist/X";
import { BOOST_VALUES, MAX_ALLOWED_CATEGORIES } from '@/lib/constant';
import BrandAmplificationMeta from '../brandAmplificationMeta/BrandAmplificationMeta';
import { brandAmplificationGetSearchMeta } from '@/lib/api';

const isFormValid = (brandAmplification) => {
    let isFormValid = true;
    if (!brandAmplification.name || brandAmplification.name.trim() === '') {
        isFormValid = false;
    }
    if (!brandAmplification.brand || brandAmplification.brand.trim() === '') {
        isFormValid = false;
    }
    if (!brandAmplification.boostValue || isNaN(brandAmplification.boostValue) || brandAmplification.boostValue <= 0) {
        isFormValid = false;
    }
    return isFormValid
}

const PromotionForm = () => {
    const {
        brandAmplification,
        brandSelector,
        categoriesSelector,
        metaSearch
    } = useSelector(state => state.BrandAmplificationFormSlice)
    const dispatch = useDispatch();

    const handleClick = () => {

    }

    const calcBrandAmplificationGetSearchMeta = async () => {
        // Call the API to get the search meta
        let res = await brandAmplificationGetSearchMeta()
        console.log('calcBrandAmplificationGetSearchMeta res page', res)
    }

    //deletes or adds a string to an array field
    const handleArrayToggle = (field, value) => {
        if (value == "") return;
        const arr = Array.isArray(brandAmplification[field]) ? brandAmplification[field] : [];
        const exists = arr.includes(value);
        if (exists) {
            dispatch(setBrandAmplificationField({ field: field, value: arr.filter((item) => item !== value) }))
        }
        else {
            if (brandAmplification.categories.length < MAX_ALLOWED_CATEGORIES)
                dispatch(setBrandAmplificationField({ field: field, value: [...arr, value] }))
        }
        calcBrandAmplificationGetSearchMeta()
    };

    const onBrandChange = (value) => {
        dispatch(setBrand({ brand: value }))
        calcBrandAmplificationGetSearchMeta()
    }
    const onCategoryChange = (value) => {
        handleArrayToggle("categories", value)
    }

    return (
        <div className='promotion-form mt-4'>
            <div className='form-section'>
                <Card>
                    <CardHeader title="Product Selection" glyphIcon="Filter" />
                    <div className={'formGroupRow mt-4'}>
                        <Combobox
                            label="Brand"
                            description="The brand you wish to amplify in the search results"
                            ///placeholder="Select fruit"
                            className={'selectInput'}
                            onChange={(value) => {
                                let name = value === null ? '' : value
                                onBrandChange(name)
                            }}
                        >
                            {(Array.isArray(brandSelector.data)
                                ? brandSelector.data
                                : []
                            ).map((brand, index) => (
                                <ComboboxOption 
                                    key={`${brand}-${index}`}
                                    value={brand.name}
                                />
                            ))}
                        </Combobox>
                        {/* <Select
                            className={'selectInput'}
                            label="Brand"
                            description="The brand you wish to amplify in the search results"
                            allowDeselect={false}
                            onChange={(value) => onBrandChange(value)}
                        >
                            {(Array.isArray(brandSelector.data)
                                ? brandSelector.data
                                : []
                            ).map((brand, index) => (
                                <Option key={`${brand}-${index}`} value={brand.name}>
                                    {brand.name}
                                </Option>
                            ))}
                        </Select> */}
                        <Select
                            className={'selectInput'}
                            label="Categories (max 3)"
                            description="If no category is selected the amplification is applied to all"
                            allowDeselect={false}
                            disabled={brandAmplification.brand?.length === 0}
                            onChange={(value) => onCategoryChange(value)}
                        >
                            {(Array.isArray(categoriesSelector.data)
                                ? categoriesSelector.data
                                : []
                            ).map((category, index) => (
                                <Option key={`${category}-${index}`} value={category.name}>
                                    {category.name}
                                </Option>
                            ))}
                        </Select>
                    </div>
                    <div className={'mt-4'}>
                        <Description><strong>Categories</strong></Description>
                        <div className={'badgesContainer'}>
                            {
                                brandAmplification && brandAmplification.categories.length > 0
                                    ? brandAmplification.categories.map((category, index) => (
                                        <Badge
                                            key={index}
                                            variant="blue"
                                            onClick={() => handleArrayToggle('categories', category)}
                                        >
                                            {category} <IconButton aria-label="Remove"> <X /> </IconButton>
                                        </Badge>))
                                    : <span className='text-muted'>No categories selected</span>
                            }

                        </div>
                    </div>
                    <section className='mt-3' id="meta-search-section">
                        <ExpandableCard
                            title="Products matched information"
                            description="Expand to see the metadata of products that will be affected by this brand amplification"
                            flagText="With $searchMeta"
                        >
                            <BrandAmplificationMeta />
                        </ExpandableCard>
                    </section>
                </Card>
                <Card className='mt-4'>
                    <CardHeader title="Brand Amplification Configuration" glyphIcon="Tag" />
                    <div className={'formGroupRow mt-4'}>
                        <TextInput
                            label="Brand name"
                            description="User friendly name to identify the promotion"
                            className={'textInput'}
                            value={brandAmplification.name}
                            onChange={(e) => dispatch(setBrandAmplificationField({ field: "name", value: e.target.value }))}
                        />
                        <Select
                            className={'selectInput'}
                            label="Boost value"
                            allowDeselect={false}
                            description="Recommended boost value (i)"
                            value={brandAmplification.boostValue}
                            onChange={(value) => dispatch(setBrandAmplificationField({ field: "boostValue", value: Number(value) }))}
                        >
                            {BOOST_VALUES.map((boost) => (
                                <Option key={`boost-${boost.value}`} value={boost.value}>
                                    {boost.label}
                                </Option>
                            ))}
                        </Select>
                    </div>
                    <Button
                        variant="primary"
                        onClick={handleClick}
                        disabled={!isFormValid(brandAmplification)}
                    >
                        Create
                    </Button>
                </Card>
            </div>
            <div className='code-section'>
                <CardHeader title="Brand Amplification" subtitle="Watch the document build live" glyphIcon="CurlyBraces" />
                <Code className="brand-amplification-json mt-4" language="javascript" showLineNumbers>
                    {JSON.stringify(brandAmplification, null, 2)}
                </Code>
                <br /><br />
                <CardHeader title="Meta Search" subtitle="Watch $metaSearch result" glyphIcon="CurlyBraces" />
                <Code className="brand-amplification-json mt-4" language="javascript" showLineNumbers>
                    {JSON.stringify(metaSearch, null, 2)}
                </Code>
            </div>

        </div>
    )
}

export default PromotionForm