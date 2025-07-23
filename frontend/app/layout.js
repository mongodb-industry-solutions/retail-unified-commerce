import { GeistSans } from "geist/font/sans";
import '../node_modules/bootstrap/dist/css/bootstrap.min.css';
import './global.css';
import ClientProvider from "./ClientProvider";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "Leafy Associate",
  description: "Unified Commerce tool to empower store associates",
  icons: [
    {
      url: "/favicon_light.png",
      media: "(prefers-color-scheme: light)",
    },
    {
      url: "/favicon_dark.png",
      media: "(prefers-color-scheme: dark)",
    },
  ],
};


export default function RootLayout({ children }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              fontFamily: "Arial, sans-serif",
            },
          }}
        />
        <ClientProvider>
          {children}
        </ClientProvider>
      </body>
    </html>
  );
}
