import type { Metadata } from "next";
import { AuthBar } from "@/components/AuthBar";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"


export const metadata: Metadata = {
  title: "PushOff",
  description: "Count push-ups in real time with on-device pose estimation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <AuthBar />
        {children}
        <Analytics/>
      </body>
    </html>
  );
}
