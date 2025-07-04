'use client'
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from "react-bootstrap";
import { useSelector, useDispatch } from 'react-redux';

import { H1, Subtitle } from '@leafygreen-ui/typography';
import ProductSearch from "@/components/productSearch/ProductSearch";
import EnterSearchBanner from "@/components/enterSearchBanner/EnterSearchBannet";
import { getProductsWithSearch, getProductsWithVectorSearch } from '@/lib/api';
import { searchIsLoading, searchProductError, setSearchResults } from '@/redux/slices/ProductInventorySlice';
import ErrorSearchBanner from '@/components/errorSearchBanner/EnterSearchBannet';
import ProductList from '@/components/productList/ProductList';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import InfoWizard from '@/components/InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import { SEARCH_OPTIONS } from '@/lib/constant';

export default function ProductInventoryPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const {
    loading,
    error,
    searchResults,
    query,
    searchType, // 'search' or 'vector-search'
  } = useSelector(state => state.ProductInventory);
  const [openHelpModal, setOpenHelpModal] = useState(false);

  const fetchResults = async () => {
    if (!query) return;

    dispatch(searchIsLoading());
    try {
      let results;
      if (searchType === SEARCH_OPTIONS.search.id) { // Assuming 0 is for 'search'  
        results = await getProductsWithSearch(query);
      } else if (searchType === SEARCH_OPTIONS.vectorSearch.id) {
        results = await getProductsWithVectorSearch(query);
      } else if (searchType === SEARCH_OPTIONS.hybridSearch.id) {
        results = await getProductsWithVectorSearch(query);
      } else if (searchType === SEARCH_OPTIONS.rerank.id) {
        results = await getProductsWithVectorSearch(query);
      } else if (searchType === SEARCH_OPTIONS.regex.id) {
        results = await getProductsWithVectorSearch(query);
      } else {
        alert('Unknown search type');
      }
      dispatch(setSearchResults({ results: results.products || [], totalItems: results.totalItems || 0 }));
    } catch (err) {
      dispatch(searchProductError({ error: err }));
    }
  };

  useEffect(() => {
    fetchResults();
  }, [query, dispatch]);

  return (
    <Container>
      <div className='d-flex w-100 justify-content-between'>
        <div
          className='d-flex align-items-center'
          style={{ cursor: 'pointer', gap: 6 }}
          onClick={() => router.push('/')}
        >
          <Icon glyph="ArrowLeft" size="large" />
          <span>Back</span>
        </div>
        <div>
          <H1 className={'text-center'}>Product Inventory</H1>
          <Subtitle className={'text-center'}>Search for a product to view detailed inventory information</Subtitle>
        </div>
        <div>
          <InfoWizard
            open={openHelpModal}
            setOpen={setOpenHelpModal}
            tooltipText="Talk track!"
            iconGlyph="Wizard"
            sections={[]}
            openModalIsButton={true}
          />
        </div>
      </div>
      <ProductSearch />
      {
        error !== null
          ? <ErrorSearchBanner error={error} />
          : searchResults.length === 0 && !loading
            ? <EnterSearchBanner />
            : searchResults.length > 0
              ? <ProductList onCurrentPageChange={fetchResults} />
              : loading
                ? <LoadingSearchBanner />
                : null
      }

    </Container>
  );
}
