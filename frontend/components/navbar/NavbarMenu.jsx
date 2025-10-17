import { USER_MAP } from '@/lib/constant';
import Icon from '@leafygreen-ui/icon';
import IconButton from '@leafygreen-ui/icon-button';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import React, { useState } from 'react'
import { ListGroup } from 'react-bootstrap';

const NavbarMenu = () => {
    const pathname = usePathname();
    const [isProfileOpen, setProfileOpen] = useState(false);
    //const selectedUser = useSelector(state => state.User.selectedUser)
    const selectedUser = pathname === '/brand-amplification'
        ? USER_MAP[1]
        : USER_MAP[0];

    const toggleProfile = () => {
        setProfileOpen(!isProfileOpen);
    };


    return (
        <div id="Profile" className={'profileContainer'}>
            {/* <LeafyGreenProvider onClick={toggleProfile}> */}
            <IconButton className={'profileIcon'} onClick={toggleProfile} aria-label="Toggle Profile">
                <Icon size={'large'} glyph="Menu" />
            </IconButton>
            {/* </LeafyGreenProvider> */}

            {isProfileOpen && (
                <div className={'profilePopup'}>
                    <ListGroup>
                        <ListGroup.Item className={'listGroupItem'}>
                            <div className="d-flex flex-row">
                                <Icon size={'large'} className="me-1 mt-2" glyph="Person" />
                                <div onClick={() => console.log('selectedUser: ', selectedUser)}>
                                    <p className={'textMyProfile'}>{selectedUser.name} {selectedUser.surname}</p>
                                    <small>{selectedUser.role}</small>
                                </div>
                            </div>
                        </ListGroup.Item>
                        <ListGroup.Item className={'listGroupItem'}>
                            <Link href="/product-inventory">
                                <div className="d-flex flex-row">
                                    <Icon size={'large'} className="me-1 mt-2" glyph="Resource" />
                                    <p>Product Inventory</p>
                                </div>
                            </Link>
                        </ListGroup.Item>
                        <ListGroup.Item className={'listGroupItem'}>
                            <Link href="/brand-amplification">
                                <div className="d-flex flex-row">
                                    <Icon size={'large'} className="me-1 mt-2" glyph="Lock" />
                                    <div>
                                        <p className='mb-0'>Brand amplification</p>
                                        <small className='mt-0' style={{fontSize: '12px'}}>Only manager access</small>
                                    </div>
                                </div>
                            </Link>
                        </ListGroup.Item>
                    </ListGroup>
                </div>
            )}
        </div>)
}

export default NavbarMenu