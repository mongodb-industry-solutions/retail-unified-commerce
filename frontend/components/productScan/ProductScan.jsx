import { getProductWithScanner } from '@/lib/api';
import { Description } from '@leafygreen-ui/typography';
import Image from 'next/image';
import React, { useEffect, useState } from 'react'
import { Modal } from 'react-bootstrap'

const ProductScan = (props) => {
    const { show, setShow } = props;
    const [isScanning, setIsScanning] = useState(false)
    const handleClose = () => setShow(false);

    useEffect(() => {
        if (show) {
            setIsScanning(true)
            // Auto-close after animation completes (2.5 seconds)
            const timer = setTimeout(() => {
                // Call method to findOne() 
                getProductWithScanner('685bfe2d3d832cf7e1614dcd')
                setShow(false)
                setIsScanning(false)
            }, 2500)

            return () => clearTimeout(timer)
        }
    }, [show]) //onScanSuccess
    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Scan Product Tag</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Description>Position the barcode or QR code within the scanner frame.</Description>
                <video
                    src="/videos/scan-video.mp4"
                    width="100%"
                    height="auto"
                    autoPlay
                    muted
                    loop
                    style={{ borderRadius: 8, marginTop: 16 }}
                />

            </Modal.Body>
            <Modal.Footer></Modal.Footer>
        </Modal>
    )
}

export default ProductScan