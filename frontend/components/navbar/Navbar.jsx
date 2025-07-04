'use client'
import React from 'react'
import { Navbar as BootstrapNavbar, Container } from 'react-bootstrap';
import NavbarBrand from 'react-bootstrap/NavbarBrand';
import { H1, H3, Body } from '@leafygreen-ui/typography';
import { MongoDBLogoMark } from '@leafygreen-ui/logo';
import './navbar.css';

const Navbar = () => {

    return (
        <BootstrapNavbar className='bootstrap-navbar'>
            <Container>
                <NavbarBrand href="/">
                    <H3>Leafy Associate <MongoDBLogoMark height={30} /></H3>
                </NavbarBrand>
            </Container>

        </BootstrapNavbar>
    )
}

export default Navbar