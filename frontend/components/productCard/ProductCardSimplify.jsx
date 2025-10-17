"use client";
import PropTypes from "prop-types";
import Icon from "@leafygreen-ui/icon";
import Card from "@leafygreen-ui/card";
import { Body, Subtitle } from "@leafygreen-ui/typography";
import Badge from "@leafygreen-ui/badge";
import Image from "next/image";
import { useState } from "react";
import InfoWizard from "../InfoWizard/InfoWizard";
import { Container } from "react-bootstrap";
import Code from "@leafygreen-ui/code";
import { useSelector } from "react-redux";

import "./productCard.css";
import Tooltip from "@leafygreen-ui/tooltip";
import IconButton from "@leafygreen-ui/icon-button";

const ProductCardSimplify = (props) => {
    const {
        productName: title,
        _id: sku,
        imageUrlS3,
        score = null,
        brand,
        category,
        isBoosted = true,
    } = props.product;
    const {
        onBrandAmplificationClick
    } = props;
    const scanProductSearch = useSelector(state => state.ProductInventory.scanProductSearch);
    const [openHelpModal, setOpenHelpModal] = useState(false);

    return (
        <>
            <Card
                onClick={() => console.log(props.product)}
                style={{ maxHeight: '122px', height: '122px' }}
                className={`product-card pt-2 pb-2 mb-2 ${isBoosted === true ? 'card-lime-light' : ''}`}
            >
                <div className='right-side-container'>
                    <Tooltip
                        trigger={
                            <IconButton aria-label="Info" onClick={() => onBrandAmplificationClick(brand, category)}>
                                <Icon glyph="Tag" />
                            </IconButton>
                        }
                    >
                        Create Brand Amplification
                    </Tooltip>


                    <InfoWizard
                        open={openHelpModal}
                        setOpen={setOpenHelpModal}
                        tooltipText="See Document"
                        iconGlyph="CurlyBraces"
                        tabs={[
                            {
                                heading: 'Product Document',
                                content: <Container>
                                    <Code language="json" className="mb-0 mt-3">
                                        {JSON.stringify(props.product, null, 2)}
                                    </Code>
                                    {
                                        scanProductSearch !== 1 &&
                                        <p><strong>Note:</strong> The <code>inventorySummary</code> field was pre filtered with the <code>$project</code> operator inside the find query to return only the summary of the current selected store. </p>
                                    }
                                </Container>
                            }
                        ]}
                        openModalIsButton={false}
                    />
                </div>
                <div className="d-flex flex-row">
                    <div className="image-container m-0 me-1 w-auto" style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: 12 }}>
                        {imageUrlS3 ? (
                            <Image
                                src={imageUrlS3}
                                alt={title}
                                width={80}
                                height={80}
                                style={{ objectFit: "contain", borderRadius: 8 }}
                            />
                        ) : (
                            <div
                                style={{
                                    width: 80,
                                    height: 80,
                                    background: "#f0f0f0",
                                    borderRadius: 8,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#bbb",
                                    fontSize: 32
                                }}
                            >
                                🖼️
                            </div>
                        )}
                    </div>
                    <div className="w-100">
                        <Subtitle
                            className="mb-1 subtitle-ellipsis"
                        >{title}</Subtitle>
                        <Body className="mb-2">
                            <strong>Brand: </strong>{brand || ''}  &nbsp;&nbsp;&nbsp;
                            <strong>Category: </strong>{category || ''}
                        </Body>
                        <div className="d-flex">
                            {score && <Badge className={''} variant="yellow">
                                <Icon glyph="Favorite" />
                                {score?.toFixed(5)}
                            </Badge>}
                            {isBoosted === true && <Badge className={'ms-1'} variant="green">
                                Store's Favorite
                            </Badge>}
                        </div>

                    </div>
                </div>
            </Card>
        </>
    );
};
ProductCardSimplify.propTypes = {
    product: PropTypes.shape({
        _id: PropTypes.string.isRequired,
        title: PropTypes.string.isRequired,
        sku: PropTypes.string.isRequired,
        score: PropTypes.number
    }).isRequired
};

export default ProductCardSimplify;
