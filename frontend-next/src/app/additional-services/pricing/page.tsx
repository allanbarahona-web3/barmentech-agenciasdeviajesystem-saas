import Link from 'next/link';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import { AdditionalServicesLinesTable } from '@/components/additional-services-lines-table';
import { Button } from '@/components/ui/button';
import styles from '../order-summary/order-summary.module.css';

export default function AdditionalServicesPricingPage() {
  return (
    <main className="app-shell">
      <div className={`${styles.page} ${styles.pricingPage}`}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Información comercial</h1>
          <p className={styles.subtitle}>
            Ingrese la información de origen para cada servicio adicional.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          <AdditionalServicesLinesTable mode="pricing" />
          <div className={styles.actions}>
            <Button asChild variant="outline" className={styles.backButton}>
              <Link href="/additional-services/order-summary">
                Volver al resumen
              </Link>
            </Button>
            <Button
              type="button"
              className={styles.continueButton}
              disabled
              title="Próximamente"
            >
              Continuar
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
