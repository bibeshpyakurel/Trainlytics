import "./globals.css";
import AppNav from "./AppNav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AppNav />

        <main>{children}</main>
      </body>
    </html>
  );
}