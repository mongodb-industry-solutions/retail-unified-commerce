"use client";

import "./productCard.css";
import PropTypes from "prop-types";
import Icon from "@leafygreen-ui/icon";
import { useRouter } from 'next/navigation';

import Card from "@leafygreen-ui/card";
import { Body, Subtitle } from "@leafygreen-ui/typography";
import Button from "@leafygreen-ui/button";
import Badge from "@leafygreen-ui/badge";
import Image from "next/image";
import { productInventoryURL } from "@/lib/constant";
import { useState } from "react";
import InfoWizard from "../InfoWizard/InfoWizard";
import { Container } from "react-bootstrap";
import Code from "@leafygreen-ui/code";
import { useSelector } from "react-redux";
import BrandAmplificationForm from "../brandAmplificationForm/BrandAmplificationForm";

const ProductCardSimplify = (props) => {
    const router = useRouter();
    const {
        _id,
        id,
        productName: title,
        _id: sku,
        imageUrlS3,
        score = null,
        quantity,
        isAmplifiedBrand // TODO change name once we connect to back
    } = props.product;
    const selectedStore = useSelector(state => state.Global.selectedStore)
    const scanProductSearch = useSelector(state => state.ProductInventory.scanProductSearch);
    const {
        shelfId: shelfNumber,
        aisleId: aisleNumber = 'N/A',
    } = props.product.inventorySummary.length === 1
            ? props.product.inventorySummary[0]
            : props.product.inventorySummary.find(store => store.storeObjectId === selectedStore) || {};
    const [openHelpModal, setOpenHelpModal] = useState(false);
    const [brandAmplificationModalOpen, setBrandAmplificationModalOpen] = useState(false)

    return (
        <>
            <Card onClick={() => console.log(props.product)} className={`product-card pt-2 pb-2 mb-2`}>
                <div className='right-side-container'>
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
                    <div>
                        <Subtitle className="mb-1">{title}</Subtitle>
                        <Body className="mb-2"><strong>SKU: </strong>{sku || id}</Body>
                        {score && <Badge className={''} variant="yellow">
                            <Icon glyph="Favorite" />
                            {score?.toFixed(5)}
                        </Badge>}
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
        // description: PropTypes.string,
        score: PropTypes.number
    }).isRequired
};

export default ProductCardSimplify;
