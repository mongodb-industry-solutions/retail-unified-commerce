import React, { useState } from 'react'
import './productSearch.css';
import InfoWizard from '../InfoWizard/InfoWizard';
import Icon from '@leafygreen-ui/icon';
import Button from '@leafygreen-ui/button';

const ProductSearch = (props) => {
    const [openHelpModal, setOpenHelpModal] = useState(false);


    const handleSearch = () => {
        // Placeholder: implement search logic here
    };

    return (
        <div className="product-search">

            <div>
                <InfoWizard
                    open={openHelpModal}
                    setOpen={setOpenHelpModal}
                    tooltipText="Talk track!"
                    iconGlyph="Wizard"
                    sections={[]}
                    openModalIsButton={false}
                />
            </div>
            <div>
                a
            </div>
            <div>
                <Button  leftGlyph={<Icon glyph={"Stitch"} />}>
                    Scan Product
                </Button>
            </div>


        </div>
    )
}

export default ProductSearch