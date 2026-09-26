import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "L’Italia Barber | Barbería en Bahía Blanca",
    template: "%s | L’Italia Barber",
  },
  description:
    "Barbería en Bahía Blanca, Alvarado 677. Corte personalizado, cuidado de barba y atención directa del dueño. Consultá y coordiná tu turno por WhatsApp",
  keywords: [
    "barbería en Bahía Blanca",
    "barbero en Bahía Blanca",
    "corte de pelo Bahía Blanca",
    "cuidado de barba Bahía Blanca",
    "L’Italia Barber",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "L’Italia Barber",
    url: "/",
    title: "L’Italia Barber | Barbería en Bahía Blanca",
    description:
      "No es solo un corte, es cómo te sentís al salir. Atención personalizada en Alvarado 677, Bahía Blanca",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "L’Italia Barber, barbería en Bahía Blanca",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "L’Italia Barber | Barbería en Bahía Blanca",
    description: "Corte personalizado y cuidado de barba en Alvarado 677, Bahía Blanca",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
