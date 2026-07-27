import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ADDITIONAL_SERVICE_CATEGORIES,
  getAdditionalServiceCategory,
} from '../services';
import styles from '../catalog.module.css';

export function generateStaticParams() {
  return ADDITIONAL_SERVICE_CATEGORIES.map((category) => ({
    service: category.slug,
  }));
}

export default async function AdditionalServicePlaceholderPage({
  params,
}: {
  params: Promise<{ service: string }>;
}) {
  const { service } = await params;
  const category = getAdditionalServiceCategory(service);

  if (!category) {
    notFound();
  }

  const Icon = category.icon;

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <section className="form-section-card" style={{ marginTop: 0 }}>
          <Icon className={styles.icon} aria-hidden="true" />
          <h1 className={styles.title} style={{ marginTop: '18px' }}>
            Formulario de {category.title} (Próximamente)
          </h1>
          <Link
            href="/additional-services/catalog"
            className="btn-primary"
            style={{
              display: 'inline-flex',
              marginTop: '4px',
              padding: '9px 14px',
              borderRadius: '9px',
              textDecoration: 'none',
              fontSize: '14px',
            }}
          >
            Volver al catálogo
          </Link>
        </section>
      </div>
    </main>
  );
}
