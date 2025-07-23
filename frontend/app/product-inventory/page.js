'use client'
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from "react-bootstrap";
import { useSelector, useDispatch } from 'react-redux';

import { H1, Subtitle } from '@leafygreen-ui/typography';
import ProductSearch from "@/components/productSearch/ProductSearch";
import EnterSearchBanner from "@/components/enterSearchBanner/EnterSearchBannet";
import { getProductsWithSearchInput } from '@/lib/api';
import { searchIsLoading, searchProductError, setSearchResults } from '@/redux/slices/ProductInventorySlice';
import ErrorSearchBanner from '@/components/errorSearchBanner/EnterSearchBannet';
import ProductList from '@/components/productList/ProductList';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import InfoWizard from '@/components/InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import HowToInventoryPage from '@/components/talkTracks/HowToInventoryPage';
import BehindTheScenes from '@/components/talkTracks/BehindTheScenes';
import ProductInventoryWyMDB from '@/components/talkTracks/ProductInventoryWyMDB';

export default function ProductInventoryPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const {
    loading,
    error,
    searchResults,
    query,
    initialLoad,
    forceSearchWithEnterToggle
  } = useSelector(state => state.ProductInventory);
  const [openHelpModal, setOpenHelpModal] = useState(false);

  const fetchResults = async () => {
    if (!query) return;
    dispatch(searchIsLoading());
    try {
      let results = await getProductsWithSearchInput(query);
      dispatch(setSearchResults({ results: results.products || [], totalItems: results.totalItems || 0 }));
    } catch (err) {
      dispatch(searchProductError({ error: err }));
    }
  };

  useEffect(() => {
    fetchResults();
  }, [query, forceSearchWithEnterToggle, dispatch]);

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
            tabs={[
              {
                heading: 'How to demo',
                content: <HowToInventoryPage />
              },
              {
                heading: 'Behind the scenes',
                content: <BehindTheScenes />
              },
              {
                heading: 'Why MongoDB?',
                content: <ProductInventoryWyMDB />
              }
            ]}
            openModalIsButton={true}
          />
        </div>
      </div>
      <ProductSearch />
      {
        error !== null
          ? <ErrorSearchBanner error={error} />
          : initialLoad && !loading
            ? <EnterSearchBanner />
            : searchResults.length === 0 && !initialLoad && !loading
              ? <div className='text-center'>No results found for "{query}". Please try a different search term.</div>
              : searchResults.length > 0 && !loading
                ? <ProductList onCurrentPageChange={fetchResults} />
                : loading
                  ? <LoadingSearchBanner />
                  : null
      }

    </Container>
  );
}
