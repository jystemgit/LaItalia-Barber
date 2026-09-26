const phoneDigits = "5492915752171";

export const business = {
  name: "L’Italia Barber",
  phoneDisplay: "+54 9 291 575 2171",
  whatsappUrl: `https://wa.me/${phoneDigits}`,
  instagramUrl: "https://instagram.com/laitalia_barber",
  services: [
    {
      name: "Corte",
      description: "Corte personalizado y asesorado según tu estilo",
    },
    {
      name: "Barba",
      description: "Diseño y cuidado de barba con atención al detalle",
    },
    {
      name: "Corte + barba",
      description: "Una experiencia completa para renovar tu estilo",
    },
  ],
} as const;