'use client'
import React, { useEffect } from 'react';
import { Container } from "react-bootstrap";
import { useSelector, useDispatch } from 'react-redux';

import ProductSearch from "@/components/productSearch/ProductSearch";
import EnterSearchBanner from "@/components/enterSearchBanner/EnterSearchBannet";
import { getProductsWithSearchInput } from '@/lib/api';
import { searchIsLoading, searchProductError, setSearchResults } from '@/redux/slices/ProductInventorySlice';
import ErrorSearchBanner from '@/components/errorSearchBanner/EnterSearchBannet';
import ProductList from '@/components/productList/ProductList';
import LoadingSearchBanner from '@/components/loadingSearchBanner/LoadingSearchBanner';
import HowToInventoryPage from '@/components/talkTracks/HowToInventoryPage';
import BehindTheScenes from '@/components/talkTracks/BehindTheScenes';
import ProductInventoryWyMDB from '@/components/talkTracks/ProductInventoryWyMDB';
import PageSubheader from '@/components/pageSubheader/PageSubheader';

export default function ProductInventoryPage() {
  const dispatch = useDispatch();
  const {
    loading,
    error,
    searchResults,
    query,
    initialLoad,
    forceSearchWithEnterToggle
  } = useSelector(state => state.ProductInventory);
  const tabs = [
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
  ]

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
      <PageSubheader
        tabs={tabs}
        header="Product Inventory"
        subtitle="Search for a product to view detailed inventory information"
      />
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
