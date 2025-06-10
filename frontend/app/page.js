'use client';

import { H1, H3, Body } from '@leafygreen-ui/typography';
import { Container } from 'react-bootstrap';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';

import '../node_modules/bootstrap/dist/css/bootstrap.min.css';
import './global.css';
import ModuleCard from '@/components/moduleCard/ModuleCard';
import { modules } from '@/lib/constant';

export default function Home() {
  return (
    <Container>
      <div className='d-flex flex-row justify-content-center '>
        <H1>Leafy Associate <MongoDBLogoMark /></H1>
      </div>

      <div className='module-grid'>
        {
          modules.map((card, index) => (
            <ModuleCard
              key={index}
              moduleName={`${card.name}`}
              description={`${card.description}`}
              url={`${card.url}`}
            />
          ))
        }
      </div>
    </Container>
  );
}
