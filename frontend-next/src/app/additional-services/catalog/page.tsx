import Link from 'next/link';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import { ADDITIONAL_SERVICE_CATEGORIES } from './services';
import styles from './catalog.module.css';

export default function AdditionalServicesCatalogPage() {
  return (
    <main className="app-shell">
      <div className={styles.page}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Servicios adicionales</h1>
          <p className={styles.subtitle}>
            Seleccione el servicio que desea agregar.
          </p>
          <Link
            href="/additional-services"
            className="btn-primary"
            style={{
              display: 'inline-flex',
              marginTop: '16px',
              padding: '9px 14px',
              borderRadius: '9px',
              textDecoration: 'none',
              fontSize: '14px',
            }}
          >
            Volver
          </Link>
        </header>

        <div className={styles.grid}>
          {ADDITIONAL_SERVICE_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const cardContent = (
              <>
                <Icon className={styles.icon} aria-hidden="true" />
                <span className={styles.cardTitle}>{category.title}</span>
              </>
            );

            if (category.disabled) {
              return (
                <div
                  key={category.slug}
                  className={`${styles.card} ${styles.disabledCard}`}
                  aria-disabled="true"
                >
                  {cardContent}
                </div>
              );
            }

            return (
              <Link
                key={category.slug}
                href={`/additional-services/catalog/${category.slug}`}
                className={styles.card}
              >
                {cardContent}
              </Link>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '32px',
          }}
        >
          <Link
            href="/additional-services/order-summary"
            className="btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Revisar orden
          </Link>
        </div>
      </div>
    </main>
  );
}
