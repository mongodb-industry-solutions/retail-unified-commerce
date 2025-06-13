'use client';

import { H1, H3, Body } from '@leafygreen-ui/typography';
import { Container } from 'react-bootstrap';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';
import { Option, Select, Size } from '@leafygreen-ui/select';

import ModuleCard from '@/components/moduleCard/ModuleCard';
import { useDispatch } from 'react-redux';

export default function Home() {
  const dispatch = useDispatch();
  const stores = useSelector(state => state.Global.stores);

  return (
    <Container>
      <div className='d-flex flex-row justify-content-center mt-4'>
        <H1>Leafy Associate <MongoDBLogoMark /></H1>
      </div>
      <div className='mt-4'>
        <Select
          className={'me-2'}
          aria-label="Search type"
          name="Search Type"
          size={Size.Default}
          defaultValue={"search"}
          label='Select a store'
          description="Choose a store to set a location for your search"
        >
          {
            stores.map((store, index) => (
              <Option
                key={index}
                value={store.value}
                description={store.description}
              >
                {store.label}
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
              disabled={card.disabled}
            />
          ))
        }
      </div>
    </Container>
  );
}
