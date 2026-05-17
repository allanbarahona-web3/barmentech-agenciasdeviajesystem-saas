import { baseEmailTemplate } from './base.template';

export interface PaymentReceivedData {
  recipientName: string;
  bookingCode: string;
  tripName: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  amountPaid: number;
  pendingAmount: number;
  currency: string;
  isPaid: boolean; // true si pendingAmount = 0
  tenantName: string;

  // Branding
  tenantLogo?: string;
  primaryColor: string;
  secondaryColor: string;
  contactEmail?: string;
  contactWhatsApp?: string;
  websiteUrl?: string;
  businessAddress?: string;
}

export function paymentReceivedTemplate(data: PaymentReceivedData): string {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      ${data.isPaid ? '¡Pago Completado! 🎉' : 'Pago Registrado'}
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.recipientName || ''},
    </p>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hemos registrado tu pago para la reserva del viaje <strong>${data.tripName}</strong>. 
      A continuación encontrarás el detalle de tu transacción.
    </p>

    <!-- Payment Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f0fdf4; border-radius: 8px; margin: 25px 0; border: 2px solid #86efac;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0 0 8px 0; color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Monto Pagado
          </p>
          <p style="margin: 0; color: #15803d; font-size: 28px; font-weight: 700;">
            ${formatCurrency(data.amountPaid, data.currency)}
          </p>
        </td>
      </tr>
    </table>

    <!-- Booking Details -->
    <h3 style="margin: 20px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
      Detalles de la Reserva
    </h3>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 40%;">
          <strong>Código de Reserva:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb; font-family: 'Courier New', monospace; font-weight: 600;">
          ${data.bookingCode}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Destino:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.destination}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Fechas:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.departureDate} a ${data.returnDate}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Monto Pagado:</strong>
        </td>
        <td style="padding: 12px 0; color: #15803d; border-bottom: 1px solid #e5e7eb; font-weight: 600;">
          ${formatCurrency(data.amountPaid, data.currency)}
        </td>
      </tr>
      ${data.pendingAmount > 0 ? `
        <tr>
          <td style="padding: 12px 0; color: #6b7280;">
            <strong>Saldo Pendiente:</strong>
          </td>
          <td style="padding: 12px 0; color: #dc2626; font-weight: 600;">
            ${formatCurrency(data.pendingAmount, data.currency)}
          </td>
        </tr>
      ` : `
        <tr>
          <td style="padding: 12px 0; color: #6b7280;">
            <strong>Estado del Pago:</strong>
          </td>
          <td style="padding: 12px 0;">
            <span style="background-color: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 4px; font-weight: 600; font-size: 14px;">
              ✓ PAGADO COMPLETAMENTE
            </span>
          </td>
        </tr>
      `}
    </table>

    <!-- Next Steps -->
    ${data.pendingAmount > 0 ? `
      <h3 style="margin: 25px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
        Saldo Pendiente
      </h3>

      <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Aún tienes un saldo pendiente de <strong>${formatCurrency(data.pendingAmount, data.currency)}</strong> 
        para completar tu reserva.
      </p>

      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
        Por favor, realiza el pago del saldo restante lo antes posible para asegurar tu lugar en el viaje.
      </p>
    ` : `
      <h3 style="margin: 25px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
        Tu Reserva Está Completamente Pagada
      </h3>

      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        ¡Excelente! Tu reserva está completamente pagada y confirmada. 
        Estamos listos para tu viaje a ${data.destination}. 
        Próximamente recibirás más detalles sobre el itinerario y puntos de encuentro.
      </p>
    `}

    <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Si tienes alguna pregunta o necesitas asistencia, por favor contáctanos.
    </p>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: 'Pago Recibido',
    subtitle: data.isPaid ? '¡Tu reserva está completamente pagada!' : 'Pago registrado correctamente',
    badge: {
      text: data.isPaid ? 'PAGADO COMPLETAMENTE' : 'PAGO REGISTRADO',
      color: data.isPaid ? 'green' : 'blue',
    },
    content,
    footer: {
      contactEmail: data.contactEmail,
      contactWhatsApp: data.contactWhatsApp,
      businessAddress: data.businessAddress,
      websiteUrl: data.websiteUrl,
    },
    primaryColor: data.primaryColor,
    secondaryColor: data.secondaryColor,
  });
}
