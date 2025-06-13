"use client";

import "./productGeneralDetails.css";
import { useSelector } from 'react-redux';
import {
  Label,
  Description
} from '@leafygreen-ui/typography';
import Image from "next/image";

const ProductGeneralDetails = (props) => {
  const { productDetails: product } = useSelector(state => state.ProductInventory);


  return (
    <div className="d-flex w-100">
      <div className="w-100">
        <Label className={'big-text'}>{product.title}</Label>
        <Description className="medium-text"><strong>SKU: </strong> {product.sku}</Description>
        <Description className="medium-text"><strong>Price: </strong> {product.priceUnit}</Description>
        <Description className="medium-text"><strong>Category: </strong>
          {
            product.categories[0]
              ? product.categories[0].charAt(0).toUpperCase() + product.categories[0].slice(1)
              : ''
          }
        </Description>
        <Description className="medium-text"><strong>Brand: </strong> {product.brandEn}</Description>
        <Description className="medium-text"><strong>Seller: </strong> {product.seller}</Description>
      </div>
      <div className="d-flex align-items-center justify-content-center">
        <div className="image-container" >
          <Image
            src={product.imageUrlS3}
            alt={product.title}
            width={80}
            height={80}
            style={{ objectFit: "contain", borderRadius: 8 }}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductGeneralDetails;
