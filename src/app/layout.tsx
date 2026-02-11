import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://studycafe.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "루트스터디 - 관리형 독서실",
  description: "실시간 학습시간 관리, 몰입도 측정, 등원 목표 관리 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "루트스터디",
  },
  openGraph: {
    title: "루트스터디 - 관리형 독서실",
    description: "실시간 학습시간 관리, 몰입도 측정, 등원 목표 관리 시스템",
    url: siteUrl,
    siteName: "루트스터디",
    images: [
      {
        url: "/image.png",
        width: 1200,
        height: 630,
        alt: "루트스터디 - WHEVER STUDY route 관리형 독서실",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "루트스터디 - 관리형 독서실",
    description: "실시간 학습시간 관리, 몰입도 측정, 등원 목표 관리 시스템",
    images: ["/image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#7C9FF5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard 폰트 CDN */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        {/* PWA 관련 */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-pretendard antialiased">
        {children}
      </body>
    </html>
  );
}
