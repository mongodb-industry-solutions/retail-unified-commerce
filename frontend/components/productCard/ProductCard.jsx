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
import { useEffect, useState } from "react";
import InfoWizard from "../InfoWizard/InfoWizard";
import { Container } from "react-bootstrap";
import Code from "@leafygreen-ui/code";
import { useSelector } from "react-redux";
import BrandAmplificationForm from "../brandAmplificationForm/BrandAmplificationForm";
import { setBrandInForm, setCategoryInForm } from "@/lib/helpers";
import BrandAmplificationList from "../brandAmplificationList/BrandAmplificationList";
import { getProductImageSignedUrl } from "@/lib/api";

const ProductCard = (props) => {
  const router = useRouter();
  const {
    _id,
    id,
    productName: title,
    brand,
    category,
    _id: sku,
    imageUrlS3,
    score = null,
    quantity,
    isBoosted
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


  const onCreateBrandAmplificationSuccess = () => {
    setBrandAmplificationModalOpen(false)
    alert('Brand Amp created')
  }
  const onOpenBrandAmplificationModal = () => {
    setBrandAmplificationModalOpen(true)
    setBrandInForm(brand)
    setCategoryInForm(category)
  }

  return (
    <>
      <Card onClick={() => console.log(props.product)} className={`product-card ${isBoosted === true ? 'card-lime-light' : ''}`}>
        <div className='score-container d-flex flex-column align-items-start'>
          {score && <Badge className={'scorebadge'} variant="yellow">
            <Icon glyph="Favorite" />
            {score?.toFixed(5)}
          </Badge>}
          {isBoosted === true && <Badge className={'mt-2 scorebadge'} variant="green">
            Store's Favorite
          </Badge>}
        </div>
        <div className='right-side-container'>
          <InfoWizard
            open={brandAmplificationModalOpen}
            setOpen={setBrandAmplificationModalOpen}
            setOpenCallback={onOpenBrandAmplificationModal}
            tooltipText="Create Brand Amplification"
            iconGlyph="Tag"
            tabs={[
              {
                heading: 'Create Brand Amplification',
                content: <Container>
                  <BrandAmplificationForm onCreateSuccess={onCreateBrandAmplificationSuccess} />
                </Container>
              },
              {
                heading: 'Brand Amplifications',
                content: <Container>
                  <BrandAmplificationList />
                </Container>
              },
            ]}
            openModalIsButton={false}
          />
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
        <div className="image-container" style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: 12 }}>
          {imageUrlS3 ? (
            <Image
              src={imageUrlS3.replace("retail-unified-commerce.s3.amazonaws.com", "d1n5xguust3bkl.cloudfront.net")}
              alt={title}
              width={80}
              height={80}
              style={{ objectFit: "contain", borderRadius: 8 }}
              unoptimized
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
        <Subtitle className="mb-1">{title}</Subtitle>
        <Body className="mb-2"><strong>SKU: </strong>{sku || id}</Body>
        <div className="w-100 d-flex flex-column" style={{ marginBottom: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon glyph="Tag" size="large" /> {/* Tag icon */}
            <span style={{ fontSize: 13 }}>
              Brand: {brand ?? 'N/A'}
              &nbsp;
              (Category '{category ?? 'N/A'}')
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon glyph="Pin" size="large" /> {/* Aisle icon */}
            <span style={{ fontSize: 13 }}>Aisle: {aisleNumber}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Icon glyph="Package" size="large" /> {/* Shelf icon */}
            <span style={{ fontSize: 13 }}>Quantity: {quantity ?? 'N/A'}</span>
          </span>
        </div>
        <Button className="w-100 mt-auto" onClick={() => router.push(productInventoryURL + '/' + (_id || id))}>
          View details
        </Button>
      </Card>
    </>
  );
};
ProductCard.propTypes = {
  product: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    sku: PropTypes.string.isRequired,
    // description: PropTypes.string,
    score: PropTypes.number
  }).isRequired
};

export default ProductCard;
