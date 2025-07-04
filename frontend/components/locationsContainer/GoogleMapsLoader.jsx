'use client';

import { useLoadScript } from '@react-google-maps/api';

const GoogleMapsLoader = ({ children }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  });

  if (loadError) return <div>Error loading map</div>;
  if (!isLoaded) return <div>Loading Google Maps…</div>;

  return children;
};

export default GoogleMapsLoader;
