import { ImageResponse } from "next/og";

export const alt = "L’Italia Barber, barbería en Bahía Blanca";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
          padding: "84px",
          background: "#252d28",
          color: "#f3f0e9",
          fontFamily: "Georgia, serif",
        }}
      >
        <span style={{ color: "#b7a078", fontSize: 20, letterSpacing: 5 }}>BARBERÍA EN BAHÍA BLANCA</span>
        <span style={{ marginTop: 38, fontSize: 82 }}>L’ITALIA BARBER</span>
        <span style={{ marginTop: 20, color: "#d7d0c3", fontSize: 30 }}>No es solo un corte. Es cómo te sentís al salir</span>
        <span style={{ marginTop: 24, color: "#b7a078", fontSize: 18, letterSpacing: 3 }}>ALVARADO 677 · BAHÍA BLANCA</span>
      </div>
    ),
    size,
  );
}