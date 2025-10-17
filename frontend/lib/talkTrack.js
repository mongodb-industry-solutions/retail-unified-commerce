import BehindTheScenes from "@/components/talkTracks/BehindTheScenes";
import BrandAmplificationBehindScenes from "@/components/talkTracks/BrandAmplificationBehindScenes";
import BrandAmplificationBusinessValue from "@/components/talkTracks/BrandAmplificationBusinessValue";
import BrandAmplificationHowToDemo from "@/components/talkTracks/BrandAmplificationHowToDemo";
import BrandAmplificationWhyMDB from "@/components/talkTracks/BrandAmplificationWhyMDB";
import HowToInventoryPage from "@/components/talkTracks/HowToInventoryPage";
import ProductInventoryWyMDB from "@/components/talkTracks/ProductInventoryWyMDB";

export const prodInventoryPage = [
    {
        heading: 'How to demo',
        content: <HowToInventoryPage isSearchPage={false} />
    },
    {
        heading: 'Behind the scenes',
        content: <BehindTheScenes />
    },
    {
        heading: 'Why MongoDB?',
        content: <ProductInventoryWyMDB />
    }
]

export const brandAmplificationPage = [
    {
        heading: 'How to demo',
        content: <BrandAmplificationHowToDemo/>
    },
    {
        heading: 'Behind the scenes',
        content: <BrandAmplificationBehindScenes/>
    },
    {
        heading: 'Brand Amplification',
        content: <BrandAmplificationBusinessValue/>
    },
    {
        heading: 'Why MongoDB?',
        content: <BrandAmplificationWhyMDB/>
    }
]