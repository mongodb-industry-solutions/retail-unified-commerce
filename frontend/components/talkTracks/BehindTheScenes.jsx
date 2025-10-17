import Image from 'next/image'
import { Container } from 'react-bootstrap'

const BehindTheScenes = () => {
  return (
    <Container className='mt-3 mb-3'>
      <p>Unified commerce aims to connect all aspects of a business, including online and offline sales channels, inventory management, order fulfillment, marketing, and customer data, into a unified view. Without replacing existing systems, MongoDB Atlas enables them to work together through a unified data strategy, functioning as an operational data layer.</p>
      <p>This demo showcases a clear picture of what retailers can accomplish with Atlas once they have a unified view of their data. In this case, it provides store associates powerful tools to make them an accurate source of information. Having a complete catalog and inventory view that is real-time and accurate will help them deliver a better experience for the customer.</p>
      <div className='w-100 d-flex align-items-center justify-content-center'>
        <Image
          src="/images/benefits.png"
          alt="Search Icon"
          width={700}
          height={500}
          style={{ width: '700px', height: 'auto' }}
          priority
        />
      </div>
      <small><strong>Figure 1.</strong>Figure 1. A unified system connecting online and offline aspects of a business. </small>

      <h3 className='mt-3'>Operational Data Layer</h3>
      <div className='d-flex flex-column align-items-center gap-2'>


        <Image
          src="/images/odl.png"
          alt="Search Icon"
          width={700}
          height={500}
          style={{ width: '700px', height: 'auto',border: '3px solid #0288d1',
          borderRadius: '16px',
          padding: '8px',
          background: '#f8fafc',
          marginBottom: '8px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.13)' }}
          
          priority
        />
        <Image
          src="/images/talkTrack/odl-inventory.png"
          alt="Search Icon"
          width={700}
          height={500}
          style={{ width: '700px', height: 'auto', border: '3px solid #0288d1',
          borderRadius: '16px',
          padding: '8px',
          background: '#f8fafc',
          marginBottom: '8px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.13)' }}
          priority
        />
        <Image
          src="/images/talkTrack/inventory-architecture.png"
          alt="Search Icon"
          width={700}
          height={500}
          style={{ width: '700px', height: 'auto', border: '3px solid #0288d1',
          borderRadius: '16px',
          padding: '8px',
          background: '#f8fafc',
          marginBottom: '8px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.13)' }}
          priority
        />
      </div>
    </Container>
  )
}

export default BehindTheScenes