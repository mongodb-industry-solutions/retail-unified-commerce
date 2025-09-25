'use client'
import React from 'react'
import { Navbar as BootstrapNavbar, Container } from 'react-bootstrap';
import NavbarBrand from 'react-bootstrap/NavbarBrand';
import { H3 } from '@leafygreen-ui/typography';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';
import './navbar.css';
import { APP_NAME } from '@/lib/constant';
import NavbarMenu from './NavbarMenu';

const Navbar = () => {

    return (
        <BootstrapNavbar className='bootstrap-navbar'>
            <Container>
                <NavbarBrand href="/">
                    <H3>{APP_NAME} <MongoDBLogoMark height={30} /></H3>
                </NavbarBrand>
                <div className={'iconButtons'}>
                    <NavbarMenu />
                </div>
            </Container>

        </BootstrapNavbar>
    )
}

export default Navbar