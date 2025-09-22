import React from 'react'
import Icon from '@leafygreen-ui/icon';
import { Subtitle, Disclaimer } from '@leafygreen-ui/typography';

export const CardHeader = (props) => {
    const { glyphIcon = 'Pin', title = 'Title', subtitle } = props;
    return (
        <>
            <p className='medium-text text-dark mb-1'>
                <Icon glyph={glyphIcon} size="large" /> {/* Aisle icon */}
                <strong>{title}</strong>
            </p>
            {
                subtitle && <Disclaimer style={{ fontSize: '14px' }}>{subtitle}</Disclaimer>
            }
        </>
    )
}
