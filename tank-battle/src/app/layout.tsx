import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "通关可看李瑞铭屁股 - Tank Battle",
  description: "通关可看李瑞铭屁股 - Classic Tank Battle Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
