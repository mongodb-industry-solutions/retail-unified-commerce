"use client";

import "./productGeneralDetails.css";
import { useSelector } from 'react-redux';
import {
  Label,
  Description
} from '@leafygreen-ui/typography';
import Image from "next/image";
import InfoWizard from "../InfoWizard/InfoWizard";
import { useState } from "react";
import { Container } from "react-bootstrap";
import Code from "@leafygreen-ui/code";

const ProductGeneralDetails = () => {
  const {
    productDetails: product,
    productInventory: inventory
  } = useSelector(state => state.ProductInventory);

  const [openHelpModal, setOpenHelpModal] = useState(false);

  return (
    <div className="">
      <div>
        <InfoWizard
          open={openHelpModal}
          setOpen={setOpenHelpModal}
          tooltipText="See Document"
          iconGlyph="CurlyBraces"
          tabs={[
            {
              heading: 'Product Document',
              content: <Container className="mt-3">
                <p>The <code>product</code> collection contains the general information of the products.
                  This is information that will never change for the product no matter in which stores
                  it is located or the inventory levels.</p>
                <p>The data of this document is displayed at the top section of this page such as: SKU, category, brancd, image, etc...</p>
                <h5>Document</h5>
                <Code language="json" className="mb-0 mt-3">
                  {JSON.stringify(product, null, 2)}
                </Code>
                <p><strong>Note: </strong> This document has been simplified with the <code>$project</code> operator, to retrieve only the fields this UI needs.</p>
              </Container>
            },
            {
              heading: 'Iventory Document',
              content: <Container className="mt-3">
                <p>The <code>inventory</code> collection contains the inventory information of the products.
                </p>
                <p>The data of this document is displayed inside the tabs of this "Product Details" page.</p>
                <h5>Document</h5>
                <Code language="json" className="mb-0 mt-3">
                  {JSON.stringify(inventory, null, 2)}
                </Code>
                <p><strong>Note: </strong> This document fields have been modified with the <code>$project</code> operator,
                  to receive it in the format that the frontend expects. What we did is the below project.</p>
                <h5>$project</h5>

                <Code language="json" className="mb-0 mt-3">
                  {JSON.stringify({
                    productId: 1,
                    updatedAt: 1,
                    selectedStoreInventory: {
                      $filter: {
                        input: "$storeInventory",
                        as: "item",
                        cond: { $eq: ["$$item.storeObjectId", '<selected-store-object-id>'] }
                      }
                    },
                    // All inventory objects NOT for the selected store
                    otherStoreInventory: {
                      $filter: {
                        input: "$storeInventory",
                        as: "item",
                        cond: { $ne: ["$$item.storeObjectId", '<selected-store-object-id>'] }
                      }
                    },
                  }, null, 2)}
                </Code>
              </Container>
            }
          ]}
          openModalIsButton={true}
        />
      </div>
      <div className="d-flex w-100 gap-3">
        <div className="w-100">
          <Label className={'big-text'}>{product.title}</Label>
          <Description className="medium-text"><strong>SKU: </strong> {product._id}</Description>
          <Description className="medium-text"><strong>Price: </strong> {product.price?.amount} {product.price?.currency}</Description>
          <Description className="medium-text"><strong>Category: </strong>{product.category}</Description>
          <Description className="medium-text"><strong>Brand: </strong> {product.brand}</Description>
          <Description className="medium-text">{product.aboutTheProduct}</Description>
        </div>
        <div className="d-flex align-items-center justify-content-center">
          <div className="image-container-details" >
            <Image
              src={product.imageUrlS3}
              alt={product.productName}
              fill
              style={{ objectFit: "contain", borderRadius: 8 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductGeneralDetails;
