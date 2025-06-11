'use client'
import { Container } from "react-bootstrap";
import { H1, H3, Subtitle } from '@leafygreen-ui/typography';
import ProductSearch from "@/components/productSearch/ProductSearch";

export default function ProductInventoryPage() {
  return (
    <Container>
      <H1 className={'text-center'}>Product Inventory</H1>
      <Subtitle className={'text-center'}>Search for a product to view detailed inventory information</Subtitle>

      <ProductSearch/>
    
    </Container>
  );
}
