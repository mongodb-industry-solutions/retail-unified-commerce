"use client";

import "./productGeneralDetails.css";
import { useSelector } from "react-redux";
import { Label, Description } from "@leafygreen-ui/typography";
import Image from "next/image";
import InfoWizard from "../InfoWizard/InfoWizard";
import { useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import Code from "@leafygreen-ui/code";
import Button from "@leafygreen-ui/button";
import { getProduct, getProductImageSignedUrl } from "@/lib/api";

const ProductGeneralDetails = (props) => {
  const { productId } = props;
  const { productDetails: product, productInventory: inventory } = useSelector(
    (state) => state.ProductInventory
  );
  const [imageUrl, setImageUrl] = useState(null);

  const [openHelpModal, setOpenHelpModal] = useState(false);
  const [fullDoc, setFullDoc] = useState(null);
  const [loadingFullDoc, setLoadingFullDoc] = useState(false);

  const getFullDocument = () => {
    setLoadingFullDoc(true);
    getProduct(productId)
      .then((data) => {
        console.log("Full product document:", data);
        setFullDoc(data);
      })
      .finally(() => {
        setLoadingFullDoc(false);
      });
  };

  useEffect(() => {
    let isMounted = true;

    async function fetchSignedUrl() {
      try {
        const url = await getProductImageSignedUrl(product.imageUrlS3);
        if (isMounted) setImageUrl(url || "/placeholder-image.png");
      } catch (err) {
        console.error("Failed to get signed URL:", err);
        if (isMounted) setImageUrl("/placeholder-image.png");
      }
    }

    fetchSignedUrl();
    return () => {
      isMounted = false;
    };
  }, [product.imageUrlS3]);

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
              heading: "Product Document",
              content: (
                <Container className="mt-3">
                  <p>
                    The <code>product</code> collection contains the general
                    information of the products. This is information that will
                    never change for the product no matter in which stores it is
                    located or the inventory levels.
                  </p>
                  <p>
                    The data of this document is displayed at the top section of
                    this page such as: SKU, category, brancd, image, etc...
                  </p>
                  <h5>Document</h5>
                  <Code language="json" className="mb-0 mt-3">
                    {JSON.stringify(product, null, 2)}
                  </Code>
                  <p>
                    <strong>Note: </strong> This document has been simplified
                    with the <code>$project</code> operator, to retrieve only
                    the fields this UI needs.
                  </p>
                  <Button
                    disabled={loadingFullDoc || fullDoc !== null}
                    className="mt-3 mb-2"
                    variant="primary"
                    onClick={() => getFullDocument()}
                  >
                    Fetch full document inside <code>product</code> collection.
                  </Button>
                  {loadingFullDoc && (
                    <div className="d-flex justify-content-center">
                      <span>Fetching data...</span>
                    </div>
                  )}
                  {fullDoc && (
                    <Code language="json" className="mb-0 mt-3">
                      {JSON.stringify(fullDoc, null, 2)}
                    </Code>
                  )}
                </Container>
              ),
            },
            {
              heading: "Iventory Document",
              content: (
                <Container className="mt-3">
                  <p>
                    The <code>inventory</code> collection contains the inventory
                    information of the products.
                  </p>
                  <p>
                    The data of this document is displayed inside the tabs of
                    this "Product Details" page.
                  </p>
                  <h5>Document</h5>
                  <Code language="json" className="mb-0 mt-3">
                    {JSON.stringify(inventory, null, 2)}
                  </Code>
                  <p>
                    <strong>Note: </strong> This document fields have been
                    modified with the <code>$project</code> operator, to receive
                    it in the format that the frontend expects. What we did is
                    the below project.
                  </p>
                  <h5>$project</h5>

                  <Code language="json" className="mb-0 mt-3">
                    {JSON.stringify(
                      {
                        productId: 1,
                        updatedAt: 1,
                        selectedStoreInventory: {
                          $filter: {
                            input: "$storeInventory",
                            as: "item",
                            cond: {
                              $eq: [
                                "$$item.storeObjectId",
                                "<selected-store-object-id>",
                              ],
                            },
                          },
                        },
                        // All inventory objects NOT for the selected store
                        otherStoreInventory: {
                          $filter: {
                            input: "$storeInventory",
                            as: "item",
                            cond: {
                              $ne: [
                                "$$item.storeObjectId",
                                "<selected-store-object-id>",
                              ],
                            },
                          },
                        },
                      },
                      null,
                      2
                    )}
                  </Code>
                </Container>
              ),
            },
          ]}
          openModalIsButton={true}
        />
      </div>
      <div className="d-flex w-100 gap-3">
        <div className="w-100">
          <Label className={"big-text"}>{product.title}</Label>
          <Description className="medium-text">
            <strong>SKU: </strong> {product._id}
          </Description>
          <Description className="medium-text">
            <strong>Price: </strong> {product.price?.amount}{" "}
            {product.price?.currency}
          </Description>
          <Description className="medium-text">
            <strong>Category: </strong>
            {product.category}
          </Description>
          <Description className="medium-text">
            <strong>Brand: </strong> {product.brand}
          </Description>
          <Description className="medium-text">
            {product.aboutTheProduct}
          </Description>
        </div>
        <div className="d-flex align-items-center justify-content-center">
          <div className="image-container-details">
            {
              <img
                src='https://retail-unified-commerce.s3.amazonaws.com/products/685bfe2e3d832cf7e1615c78.png'
                alt={product.productName || "Product"}
                style={{ objectFit: "contain", borderRadius: 8 }}
              ></img>
// imageUrl ? (
            //   <Image
            //     src={imageUrl}
            //     alt={product.productName || "Product"}
            //     fill
            //     style={{ objectFit: "contain", borderRadius: 8 }}
            //     unoptimized
            //   />
            // ) : (
            //   <Image
            //     src="/placeholder-image.png"
            //     alt="Placeholder"
            //     fill
            //     style={{ objectFit: "contain", borderRadius: 8 }}
            //     unoptimized
            //   />
            // )
            }
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductGeneralDetails;
