import { baseEmailTemplate } from './base.template';

export interface BookingConfirmationData {
  recipientName: string;
  clientEmail: string;
  tripCode: string;
  tripName: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  participantCount: number;
  totalAmount: number;
  currency: string;
  bookingCode: string;
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

export function bookingConfirmationTemplate(data: BookingConfirmationData): string {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      ¡Reserva Confirmada!
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.recipientName || ''},
    </p>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Tu reserva para el viaje <strong>${data.tripName}</strong> ha sido confirmada exitosamente. 
      A continuación encontrarás los detalles de tu reserva.
    </p>

    <!-- Booking Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; margin: 25px 0; border: 2px solid #e5e7eb;">
      <tr>
        <td style="padding: 20px; border-right: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Código de Reserva
          </p>
          <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace;">
            ${data.bookingCode}
          </p>
        </td>
        <td style="padding: 20px;">
          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            Viaje
          </p>
          <p style="margin: 0; color: #1f2937; font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace;">
            ${data.tripCode}
          </p>
        </td>
      </tr>
    </table>

    <!-- Trip Details -->
    <h3 style="margin: 20px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
      Detalles del Viaje
    </h3>

    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb; width: 40%;">
          <strong>Destino:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.destination}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Salida:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.departureDate}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Regreso:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.returnDate}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">
          <strong>Participantes:</strong>
        </td>
        <td style="padding: 12px 0; color: #1f2937; border-bottom: 1px solid #e5e7eb;">
          ${data.participantCount} ${data.participantCount === 1 ? 'persona' : 'personas'}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #6b7280;">
          <strong style="font-size: 16px;">Monto Total:</strong>
        </td>
        <td style="padding: 12px 0; color: ${data.primaryColor}; font-size: 16px; font-weight: 700;">
          ${formatCurrency(data.totalAmount, data.currency)}
        </td>
      </tr>
    </table>

    <!-- Payment Info -->
    <h3 style="margin: 25px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
      Próximos Pasos
    </h3>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Para confirmar completamente tu reserva, debes realizar el pago dentro de los próximos 7 días. 
      El monto a pagar es de <strong>${formatCurrency(data.totalAmount, data.currency)}</strong>.
    </p>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Por favor, contacta a nuestro equipo con tu código de reserva <strong>${data.bookingCode}</strong> 
      para conocer los detalles de pago disponibles.
    </p>

    ${data.contactWhatsApp ? `
      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td align="center">
            <a href="https://wa.me/${data.contactWhatsApp}?text=Hola,%20tengo%20una%20reserva%20con%20código%20${data.bookingCode}" 
               style="background-color: #25d366; color: #ffffff; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 600; text-decoration: none; display: inline-block;">
              💬 Contactar por WhatsApp
            </a>
          </td>
        </tr>
      </table>
    ` : ''}

    <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Si tienes preguntas o necesitas asistencia, no dudes en contactarnos.
    </p>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: '¡Tu Reserva Está Confirmada!',
    subtitle: `Viaje a ${data.destination}`,
    badge: {
      text: 'RESERVA CONFIRMADA',
      color: 'green',
    },
    content,
    cta: {
      text: `Código de Reserva: ${data.bookingCode}`,
      info: 'Guarda este código, lo necesitarás para realizar el pago',
    },
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
