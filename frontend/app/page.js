'use client';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { H1, H3, Body } from '@leafygreen-ui/typography';
import { Container } from 'react-bootstrap';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';
import { Option, Select, Size } from '@leafygreen-ui/select';

import ModuleCard from '@/components/moduleCard/ModuleCard';
import { modules } from '@/lib/constant';
import { setSelectedStore, setStores } from '@/redux/slices/GlobalSlice';
import { getStores } from '@/lib/api';

export default function Home() {
  const dispatch = useDispatch();
  const { stores, selectedStore } = useSelector(state => state.Global);

  useEffect(() => {
    const fetchStores = async () => {
      dispatch(setStores({ stores: [] }));
      try {
        let results = await getStores();
        console.log('Fetched stores:', results);
        dispatch(setStores({ stores: results || [] }));
        if (results && results.length > 0) {
          dispatch(setSelectedStore({ store: results[0]._id }));
        }

      } catch (err) {
        console.error('Error fetching stores:', err);
        // Optionally handle error (e.g., show a notification)
      }
    };
    fetchStores();
  }, [])

  return (
    <Container>
      <div className='d-flex flex-row justify-content-center mt-4'>
        <H1>Leafy Associate <MongoDBLogoMark /></H1>
      </div>
      <div className='mt-4'>
        <Select
          className={'me-2'}
          aria-label="Store "
          name="Store"
          size={Size.Default}
          value={selectedStore}
          onChange={(value) => {
            if (!value) return;
            dispatch(setSelectedStore({store: value}));
          }}
          label='Select a store'
          description="Choose a store to set a location for your search"
        >
          {
            stores?.map((store, index) => (
              <Option
                key={index}
                value={store._id}
                description={store.location.address}
              >
                {store.storeName}
              </Option>
            ))
          }
        </Select>
      </div>

      <div className='module-grid'>
        {
          modules.map((card, index) => (
            <ModuleCard
              key={index}
              moduleName={`${card.name}`}
              description={`${card.description}`}
              url={`${card.url}`}
              disabled={card.disabled || selectedStore === null}
            />
          ))
        }
      </div>
    </Container>
  );
}
