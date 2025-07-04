import { GeistSans } from "geist/font/sans";
import '../node_modules/bootstrap/dist/css/bootstrap.min.css';
import './global.css';
import ClientProvider from "./ClientProvider";

export const metadata = {
  title: "Home",
  description: "",
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
