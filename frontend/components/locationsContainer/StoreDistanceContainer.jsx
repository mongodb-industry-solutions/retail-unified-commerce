import React, { useState } from "react";
import InfoWizard from "../InfoWizard/InfoWizard";
import LocationLearnMore from "./LocationLearnMore";
import LocationInMap from "./LocationInMap";
import { useSelector } from "react-redux";

const StoreDistanceContainer = (props) => {
  const { store, getStoreDistance } = props;
  const { stores } = useSelector((state) => state.Global);
  const [openHelpModal, setOpenHelpModal] = useState(false);

  return (
    <div>
      {getStoreDistance(stores, store.storeObjectId)}
      <InfoWizard
        open={openHelpModal}
        setOpen={setOpenHelpModal}
        tooltipText="Learn more!"
        iconGlyph="Wizard"
        tabs={[
          {
            heading: "Map",
            content: (
              <LocationInMap
                marker={{
                  lat: stores.find((s) => s._id === store.storeObjectId)
                    .location.coordinates[1],
                  lng: stores.find((s) => s._id === store.storeObjectId)
                    .location.coordinates[0],
                }}
              />
            ),
          },
          {
            heading: "Geospatial queries",
            content: <LocationLearnMore />,
          },
        ]}
        openModalIsButton={false}
      />
    </div>
  );
};

export default StoreDistanceContainer;
