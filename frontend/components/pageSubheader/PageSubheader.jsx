import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@leafygreen-ui/icon';
import { H1, Subtitle } from '@leafygreen-ui/typography';
import InfoWizard from '../InfoWizard/InfoWizard';

const PageSubheader = (props) => {
    const { tabs, header, subtitle } = props
    const router = useRouter();
    const [openHelpModal, setOpenHelpModal] = useState(false);

    return (
        <div className='d-flex w-100 justify-content-between'>
            <div
                className='d-flex align-items-center'
                style={{ cursor: 'pointer', gap: 6 }}
                onClick={() => router.push('/')}
            >
                <Icon glyph="ArrowLeft" size="large" />
                <span>Back</span>
            </div>
            <div>
                <H1 className={'text-center'}>{header}</H1>
                <Subtitle className={'text-center'}>{subtitle}</Subtitle>
            </div>
            <div>
                <InfoWizard
                    open={openHelpModal}
                    setOpen={setOpenHelpModal}
                    tooltipText="Talk track!"
                    iconGlyph="Wizard"
                    tabs={tabs}
                    openModalIsButton={true}
                />
            </div>
        </div>)
}

export default PageSubheader