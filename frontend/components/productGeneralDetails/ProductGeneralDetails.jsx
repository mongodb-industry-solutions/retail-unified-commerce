"use client";

import "./productGeneralDetails.css";
import { useSelector } from 'react-redux';
import {
  Label,
  Description
} from '@leafygreen-ui/typography';
import Image from "next/image";

const ProductGeneralDetails = () => {
  const { productDetails: product } = useSelector(state => state.ProductInventory);


  return (
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
  );
};

export default ProductGeneralDetails;
