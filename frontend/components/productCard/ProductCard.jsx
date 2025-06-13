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


const ProductCard = (props) => {
  const router = useRouter();
  const {
    _id,
    title,
    sku,
    description,
    imageUrlS3,
    shelfNumber,
    aisleNumber = 'N/A',
    score = 0
  } = props.product;


  return (
    <Card onClick={() => console.log(props.product)} className='product-card'>
      <div className={'score-container'}>
          <Badge className={'scorebadge'} variant="yellow">
            <Icon glyph="Favorite" />
            {score.toFixed(5)}
          </Badge>
      </div>
      <div className="image-container" style={{ width: "100%", display: "flex", justifyContent: "center", marginBottom: 12 }}>
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
      <Subtitle className="mb-1">{title}</Subtitle>
      <Body className="mb-1" style={{ color: "#888" }}>{description}</Body>
      <Body className="mb-2"><strong>SKU: </strong>{sku}</Body>
      <div className="w-100 d-flex flex-column" style={{ marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Icon glyph="Pin" size="small" /> {/* Aisle icon */}
          <span style={{ fontSize: 13 }}>Aisle: {aisleNumber}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Icon glyph="Package" size="small" /> {/* Shelf icon */}
          <span style={{ fontSize: 13 }}>Shelf: {shelfNumber ?? 'N/A'}</span>
        </span>
      </div>
      <Button className="w-100 mt-auto" onClick={() => router.push(productInventoryURL + '/' + _id)}>
        View detailss
      </Button>
    </Card>
  );
};
ProductCard.propTypes = {
  product: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    sku: PropTypes.string.isRequired,
    description: PropTypes.string,
    score: PropTypes.number
  }).isRequired
};

export default ProductCard;
