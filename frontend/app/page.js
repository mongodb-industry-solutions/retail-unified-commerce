'use client';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { H1, H3, Description } from '@leafygreen-ui/typography';
import { Container } from 'react-bootstrap';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';
import { Option, Select, Size } from '@leafygreen-ui/select';

import ModuleCard from '@/components/moduleCard/ModuleCard';
import { modules } from '@/lib/constant';
import { setSelectedStore, setStores } from '@/redux/slices/GlobalSlice';
import { getStores } from '@/lib/api';
import Card from '@leafygreen-ui/card';
import Image from 'next/image';
import Icon from '@leafygreen-ui/icon';

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
            dispatch(setSelectedStore({ store: value }));
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

      <hr></hr>
      <hr></hr>
      <section className="w-full flex-shrink-0 mb-6">
        <H3 className="mb-2 text-center text-xl">Related Resources</H3>
        <div className="module-grid">
          {/* Card 1 */}
          <Card className="d-flex flex-column align-items-center p-3 w-100 md:w-1/3 max-w-xs mx-auto">
            <Image
              src="/icons/github.png"
              alt="GitHub Repository"
              width={36}
              height={36}
              className="mb-1 object-contain"
            />
            <H3 className="mb-1 text-center text-base">GitHub Repository</H3>
            <Description className="text-center mb-1 text-xs">
              Explore the source code and implementation details of this demo.
            </Description>
            <a
              href="https://github.com/mongodb-industry-solutions/retail-unified-commerce"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center self-center text-blue-600 hover:underline hover:decoration-gray-200 hover:underline-offset-4 hover:decoration-2"
              style={{ color: "#2563eb" }}
            >
              Try the demo
              <Icon
                glyph="ChevronRight"
                size={10}
                className="ml-1 text-blue-600"
              />
            </a>
          </Card>
          {/* Card 2 */}
          <Card className="d-flex flex-column align-items-center p-3 w-100 md:w-1/3 max-w-xs mx-auto">
            <Image
              src="/icons/deck.png"
              alt="Slides Deck"
              width={36}
              height={36}
              className="mb-1 object-contain"
            />
            <H3 className="mb-1 text-center text-base">Slide Deck</H3>
            <Description className="text-center mb-1 text-xs">
              Discover how unified commerce is transforming the retail space.
            </Description>
            <a
              href=""
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center self-center text-blue-600 hover:underline hover:decoration-gray-200 hover:underline-offset-4 hover:decoration-2 mt-1"
              style={{ color: "#2563eb" }}
            >
              View the deck
              <Icon
                glyph="ChevronRight"
                size={10}
                className="ml-1 text-blue-600"
              />
            </a>
          </Card>
          {/* Card 3 */}
          <Card className="d-flex flex-column align-items-center p-3 w-100 md:w-1/3 max-w-xs mx-auto">
            <Image
              src="/icons/read.png"
              alt="MongoDB Atlas"
              width={36}
              height={36}
              className="mb-1 object-contain"
            />
            <H3 className="mb-1 text-center text-base">ITDM Blog Post</H3>
            <Description className="text-center mb-1 text-xs">
              Learn more about how unified commerce is empowering store associates.
            </Description>
            <a
              href="https://www.mongodb.com/company/blog/innovation/empower-retail-associates-unified-commerce-mongodb-atlas"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center self-center text-blue-600 hover:underline hover:decoration-gray-200 hover:underline-offset-4 hover:decoration-2 mt-1"
              style={{ color: "#2563eb" }}
            >
              Read the blog
              <Icon
                glyph="ChevronRight"
                size={10}
                className="ml-1 text-blue-600"
              />
            </a>
          </Card>
        </div>
      </section>


    </Container>
  );
}
