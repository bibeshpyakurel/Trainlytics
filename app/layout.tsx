import "./globals.css";
import AppNav from "./AppNav";
import { STORAGE_KEYS } from "@/lib/preferences";
import GlobalErrorReporter from "./GlobalErrorReporter";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  try {
    const savedTheme = localStorage.getItem("${STORAGE_KEYS.theme}");
    const isDark = savedTheme ? savedTheme === "dark" : true;
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
  } catch {}
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <GlobalErrorReporter />
        <AppNav />

        <main>{children}</main>
      </body>
    </html>
  );
}
