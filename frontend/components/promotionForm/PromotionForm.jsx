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
import { setBrand, setBrandAmplificationField } from '@/redux/slices/PromotionFormSlice';
import { BOOST_VALUES } from '@/lib/constant';
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
            dispatch(setBrandAmplificationField({ field: field, value: [ value] }))
        }
        calcBrandAmplificationGetSearchMeta()
    };

    const onBrandChange = (brand = null) => {
        dispatch(setBrand({ brand: brand?._id, categories: brand?.categories }))
        calcBrandAmplificationGetSearchMeta()
    }
    const onCategoryChange = (value) => {
        if (value === "") {
            dispatch(setBrandAmplificationField({ field: "categories", value: [] }))
            calcBrandAmplificationGetSearchMeta()
            return
        }
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
                            className={'selectInput'}
                            onChange={(value) => {
                                if(value === null)
                                    onBrandChange(null)
                            }}
                        >
                            {(Array.isArray(brandSelector.data)
                                ? brandSelector.data
                                : []
                            ).map((brand, index) => (
                                <ComboboxOption
                                    key={`brand-${index}`}
                                    value={`${brand._id} (${brand.count} products)`}
                                    onClick={() => {
                                        //let name = value === null ? '' : value
                                        onBrandChange(brand)
                                    }}
                                />
                            ))}
                        </Combobox>
                        <Select
                            className={'selectInput'}
                            label="Categories (max 1)"
                            description="If no category is selected the amplification is applied to all"
                            allowDeselect={true}
                            disabled={brandAmplification.brand?.length === 0}
                            onChange={(value) => onCategoryChange(value)}
                        >
                            {(Array.isArray(categoriesSelector.data)
                                ? categoriesSelector.data
                                : []
                            ).map((category, index) => (
                                <Option key={`category-${index}`} value={category}>
                                    {category}
                                </Option>
                            ))}
                        </Select>
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
                    {JSON.stringify(metaSearch?.meta?.meta, null, 2)}
                </Code>
            </div>

        </div>
    )
}

export default PromotionForm
