"use client";

import { useState, useEffect } from "react";

const GoogleMapsLoader = ({ children }) => {
  const [apiKey, setApiKey] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // 1. Fetch the API key from your API route
  useEffect(() => {
    async function fetchApiKey() {
      try {
        const response = await fetch("/api/config");
        if (!response.ok) throw new Error("Failed to fetch config");

        const data = await response.json();
        setApiKey(data.googleMapsApiKey);
      } catch (err) {
        console.error("Error fetching Google Maps key:", err);
        setConfigError(true);
      }
    }

    fetchApiKey();
  }, []);

  // 2. After API key is fetched, load Google Maps script manually
  useEffect(() => {
    if (!apiKey) return;

    async function loadMaps() {
      try {
        await loadGoogleMaps(apiKey);
        setLoaded(true);
      } catch (err) {
        console.error("Error loading Google Maps script:", err);
        setLoadError(err);
      }
    }

    loadMaps();
  }, [apiKey]);

  // UI states
  if (configError) return <div>Error loading map configuration</div>;
  if (!apiKey) return <div>Loading configuration...</div>;
  if (loadError) return <div>Error loading Google Maps: {loadError.message}</div>;
  if (!loaded) return <div>Loading Google Maps...</div>;

  return children;
};

export default GoogleMapsLoader;

/* ----------------------------------------------------
   Script loader helper (no double loading)
---------------------------------------------------- */
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    // If script already exists, do not load again
    if (document.getElementById("google-maps-script")) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&loading=async&libraries=places`;
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));

    document.head.appendChild(script);
  });
}
