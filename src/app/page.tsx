import Image from "next/image";
import BookingFlow from "@/app/components/BookingFlow";
import AccountLink from "@/app/components/AccountLink";
import MobileMenu from "@/app/components/MobileMenu";
import { business } from "@/lib/business";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "BarberShop",
  name: business.name,
  description:
    "Barbería en Bahía Blanca con corte personalizado, cuidado de barba y atención directa del dueño",
  telephone: business.phoneDisplay,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Alvarado 677",
    addressLocality: "Bahía Blanca",
    addressRegion: "Buenos Aires",
    addressCountry: "AR",
  },
  areaServed: { "@type": "City", name: "Bahía Blanca" },
  sameAs: [business.instagramUrl],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Servicios de barbería",
    itemListElement: business.services.map((service) => ({
      "@type": "Offer",
      itemOffered: {
        "@type": "Service",
        name: service.name,
        description: service.description,
      },
    })),
  },
};

function WhatsAppLink({ className = "" }: { className?: string }) {
  return (
    <a
      className={`whatsapp-link ${className}`}
      href={business.whatsappUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Hablar por WhatsApp con L’Italia Barber"
    >
      <Image src="/whatsapp.svg" alt="" width={24} height={24} />
    </a>
  );
}

export default function Home() {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#inicio" aria-label="L’Italia Barber, inicio">
          <Image className="wordmark__logo" src="/images/logobarber.png" alt="" width={48} height={48} />
          <span className="wordmark__text">
            <span className="wordmark__name">L’ITALIA</span>
            <span className="wordmark__descriptor">BARBER</span>
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Navegación principal">
          <a href="#inicio">Inicio</a>
          <a href="#experiencia">Experiencia</a>
          <a href="#servicios">Servicios</a>
          <a href="#reservas">Reservas</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <AccountLink className="header-account button--reserve" />
        <a className="header-booking button--reserve" href="#reservas">
          Reservar turno
        </a>
        <MobileMenu />
      </header>

      <main>
        <section className="hero" id="inicio" aria-labelledby="hero-title">
          <Image
            className="hero__image"
            src="/images/barberia-editorial.jpg"
            alt="Interior de barbería de inspiración clásica, imagen ilustrativa"
            fill
            priority
            sizes="100vw"
          />
          <div className="hero__veil" aria-hidden="true"></div>
          <div className="hero__content">
            <p className="eyebrow eyebrow--light">ESTILO. SERVICIO. PROPÓSITO</p>
            <h1 id="hero-title">
              No es solo
              <br />
              un corte
              <br />
              <em>Es cómo te sentís</em>
              <br />
              al salir
            </h1>
            <p className="hero__intro">Un servicio pensado para vos</p>
            <div className="hero__actions">
              <a className="button button--reserve" href="#reservas">
                Reservar turno
              </a>
            </div>
          </div>
          <a className="hero__scroll" href="#experiencia" aria-label="Deslizate para descubrir la experiencia">
            <span className="hero__scroll-line" aria-hidden="true"></span>
            <span>DESLIZÁ PARA DESCUBRIR</span>
          </a>
        </section>

        <section className="philosophy section-pad" id="experiencia" aria-labelledby="philosophy-title">
          <div className="philosophy__image-wrap">
            <Image
              src="/images/img5.jpeg"
              alt="El barbero atendiendo a un cliente en L’Italia Barber"
              fill
              sizes="(max-width: 760px) 100vw, 48vw"
              loading="lazy"
            />
          </div>
          <div className="philosophy__copy">
            <p className="eyebrow">EL ESTILO TAMBIÉN SE ESCUCHA</p>
            <h2 id="philosophy-title">Encontrá<br />tu <em>estilo</em></h2>
            <p className="philosophy__lead">
              Encontrar tu estilo no es simplemente elegir un corte. Es entender
              qué te queda bien, qué buscás y cómo querés verte
            </p>
            <p>
              Combinamos técnica, asesoramiento y atención personalizada para que
              cada decisión tenga sentido. Un trabajo hecho con tiempo, criterio
              y atención al detalle
            </p>
            <a className="text-link" href="#servicios">
              Encontrá tu próximo servicio
            </a>
          </div>
          <div className="experience-gallery">
            <div className="experience-gallery__heading">
              <div>
                <h3>El detalle habla <em>por sí solo</em></h3>
              </div>
            </div>
            <div className="experience-gallery__grid">
              <figure>
                <div className="experience-gallery__image">
                  <Image
                    src="/images/img2.jpeg"
                    alt="Vista posterior de un corte masculino en proceso"
                    fill
                    sizes="(max-width: 760px) 100vw, 33vw"
                    loading="lazy"
                  />
                </div>
              </figure>
              <figure>
                <div className="experience-gallery__image">
                  <Image
                    src="/images/img1.jpeg"
                    alt="Trabajo de barba con navaja en el sillón de barbería"
                    fill
                    sizes="(max-width: 760px) 100vw, 33vw"
                    loading="lazy"
                  />
                </div>
              </figure>
              <figure>
                <div className="experience-gallery__image">
                  <Image
                    src="/images/img3.jpeg"
                    alt="Detalle del perfilado de barba"
                    fill
                    sizes="(max-width: 760px) 100vw, 33vw"
                    loading="lazy"
                  />
                </div>
              </figure>
            </div>
          </div>
        </section>

        <section className="services section-pad" id="servicios" aria-labelledby="services-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SERVICIOS</p>
              <h2 id="services-title">Tu estilo,<br /><em>a tu manera</em></h2>
            </div>
            <p className="section-heading__aside">
              Cada servicio empieza con una conversación. Elegimos juntos lo que
              mejor va con vos
            </p>
          </div>
          <div className="service-list">
            {business.services.map((service) => (
              <article className="service-row" key={service.name}>
                <h3>{service.name}</h3>
                <p>{service.description}</p>
              </article>
            ))}
          </div>
          <div className="services__footer">
            <p>¿No sabés cuál elegir? Lo conversamos</p>
            <a className="button button--reserve" href="#reservas">
              Reservar turno
            </a>
          </div>
        </section>

        <section className="pause" aria-labelledby="pause-title">
          <div className="pause__image">
            <Image
              src="/images/img4.jpeg"
              alt="Herramientas profesionales de barbería"
              fill
              sizes="(max-width: 760px) 100vw, 50vw"
              loading="lazy"
            />
          </div>
          <div className="pause__copy">
            <p className="eyebrow eyebrow--light">UN MOMENTO PARA VOS</p>
            <h2 id="pause-title">Más que<br />una <em>barbería</em></h2>
            <p>Un lugar para hacer una pausa<br />Para desconectarte<br />Para compartir un momento</p>
            <span className="pause__rule" aria-hidden="true"></span>
            <span className="pause__signature">L’ITALIA BARBER</span>
          </div>
        </section>

        <section className="purpose section-pad" aria-labelledby="purpose-title">
          <div className="purpose__mark" aria-hidden="true">L’</div>
          <p className="eyebrow eyebrow--light">NUESTRO PROPÓSITO</p>
          <h2 id="purpose-title">Queremos que<br />encuentres <em>paz</em></h2>
          <p className="purpose__text">
            Un lugar para hacer una pausa, desconectarte y compartir un momento.
            Porque creemos que la verdadera paz viene de Dios
          </p>
          <span className="purpose__signature">ESTILO. SERVICIO. PROPÓSITO</span>
        </section>

        <section className="booking section-pad" id="reservas" aria-labelledby="booking-title">
          <div className="booking__intro">
            <p className="eyebrow eyebrow--light">TU PRÓXIMO MOMENTO EMPIEZA ACÁ</p>
            <h2 id="booking-title">Hagamos un<br /><em>espacio para vos</em></h2>
            <p>Contanos qué estás buscando y coordinamos el mejor momento para atenderte</p>
          </div>
          <BookingFlow />
        </section>

        <section className="contact" id="contacto" aria-labelledby="contact-title">
          <div className="contact__info">
            <p className="eyebrow">ESTAMOS PARA VOS</p>
            <h2 id="contact-title">Nos encontramos<br /><em>pronto</em></h2>
            <div className="contact__details">
              <div className="contact-item">
                <span>VISITANOS</span>
                <p>Alvarado 677<br />Bahía Blanca</p>
                <a href="https://maps.google.com/?q=Alvarado+677%2C+Bahia+Blanca%2C+Argentina" target="_blank" rel="noreferrer">Ver indicaciones</a>
              </div>
              <div className="contact-item">
                <span>HORARIOS</span>
                <p>Consultar disponibilidad</p>
              </div>
              <div className="contact-item">
                <span>ESCRIBINOS</span>
                <a href={`tel:${business.phoneDisplay.replaceAll(" ", "")}`}>{business.phoneDisplay}</a>
              </div>
              <div className="contact-item">
                <span>SEGUINOS</span>
                <a href={business.instagramUrl} target="_blank" rel="noreferrer">@laitalia_barber</a>
              </div>
            </div>
            <div className="contact__actions">
              <a className="button button--reserve" href="#reservas">Reservar turno</a>
            </div>
          </div>
          <div className="contact__map">
            <iframe
              title="Mapa de L’Italia Barber en Alvarado 677, Bahía Blanca"
              src="https://www.google.com/maps?q=Alvarado%20677%2C%20Bah%C3%ADa%20Blanca%2C%20Argentina&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="wordmark wordmark--footer" href="#inicio" aria-label="L’Italia Barber, volver al inicio">
          <Image className="wordmark__logo" src="/images/logobarber.png" alt="" width={48} height={48} />
          <span className="wordmark__text">
            <span className="wordmark__name">L’ITALIA</span>
            <span className="wordmark__descriptor">BARBER</span>
          </span>
        </a>
        <p className="site-footer__motto">Estilo. Servicio. Propósito</p>
        <nav aria-label="Enlaces del pie de página">
          <a href="#inicio">Inicio</a>
          <a href="#servicios">Servicios</a>
          <a href="#reservas">Reservas</a>
          <a href="#contacto">Contacto</a>
          <a href="/ingresar">Mi cuenta</a>
          <a href={business.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>
        </nav>
        <span className="site-footer__copyright">© {new Date().getFullYear()} L’Italia Barber</span>
      </footer>

      <WhatsAppLink className="whatsapp-float" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
