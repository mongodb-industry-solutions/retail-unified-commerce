import { GeistSans } from "geist/font/sans";
import '../node_modules/bootstrap/dist/css/bootstrap.min.css';
import './global.css';
import ClientProvider from "./ClientProvider";

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
          <ClientProvider>
            {children}
          </ClientProvider>
      </body>
    </html>
  );
}
