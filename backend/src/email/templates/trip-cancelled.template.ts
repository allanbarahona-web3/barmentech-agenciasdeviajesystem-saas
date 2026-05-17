import { baseEmailTemplate } from './base.template';

export interface TripCancelledNotificationData {
  recipientName: string;
  tripName: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  reason?: string; // Razón de cancelación
  refundInfo?: string; // Información sobre reembolsos (futuro)
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

export function tripCancelledNotificationTemplate(data: TripCancelledNotificationData): string {
  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
      Notificación Importante
    </h2>
    
    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Hola ${data.recipientName || ''},
    </p>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Lamentamos informarte que el viaje <strong>${data.tripName}</strong> ha sido cancelado.
    </p>

    <!-- Cancellation Info Card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #fef2f2; border-radius: 8px; margin: 25px 0; border: 2px solid #fca5a5;">
      <tr>
        <td style="padding: 20px;">
          <p style="margin: 0 0 12px 0; color: #7f1d1d; font-size: 16px; font-weight: 600;">
            ⚠️ Viaje Cancelado
          </p>
          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 12px;">
            <tr>
              <td style="padding: 8px 0; color: #7f1d1d; border-bottom: 1px solid #fecaca;">
                <strong>Destino:</strong> ${data.destination}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #7f1d1d; border-bottom: 1px solid #fecaca;">
                <strong>Fechas:</strong> ${data.departureDate} a ${data.returnDate}
              </td>
            </tr>
            ${data.reason ? `
              <tr>
                <td style="padding: 8px 0; color: #7f1d1d;">
                  <strong>Razón:</strong> ${data.reason}
                </td>
              </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <!-- Information Section -->
    <h3 style="margin: 25px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
      Información Importante
    </h3>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      Entendemos que esta noticia puede ser decepcionante. Nuestro equipo está trabajando en encontrar 
      alternativas de viajes similares que puedan cumplir con tus expectativas.
    </p>

    ${data.refundInfo ? `
      <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        <strong>Información sobre Reembolsos:</strong>
      </p>
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
        ${data.refundInfo}
      </p>
    ` : `
      <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
        Si realizaste un pago por adelantado, nos pondremos en contacto contigo dentro de los próximos días 
        para discutir los detalles del reembolso o alternativas disponibles.
      </p>
    `}

    <!-- Next Steps -->
    <h3 style="margin: 25px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
      Próximos Pasos
    </h3>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      1. <strong>Revisar ofertas alternativas:</strong> Te enviaremos información sobre viajes similares que aún están disponibles.
    </p>

    <p style="margin: 0 0 15px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      2. <strong>Contactar para más información:</strong> Puedes comunicarte con nuestro equipo en cualquier momento 
      para resolver dudas o explorar otras opciones.
    </p>

    <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
      3. <strong>Cambios o reembolsos:</strong> Si aplica un reembolso o cambio, recibirás los detalles específicos 
      de nuestro equipo de finanzas.
    </p>

    ${data.contactWhatsApp ? `
      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td align="center">
            <a href="https://wa.me/${data.contactWhatsApp}?text=Hola,%20tengo%20una%20pregunta%20sobre%20la%20cancelación%20del%20viaje%20a%20${encodeURIComponent(data.destination)}" 
               style="background-color: #25d366; color: #ffffff; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 600; text-decoration: none; display: inline-block;">
              💬 Contactar por WhatsApp
            </a>
          </td>
        </tr>
      </table>
    ` : ''}

    <p style="margin: 0 0 10px 0; color: #4b5563; font-size: 15px; line-height: 1.6;">
      Agradecemos tu comprensión y confianza. Estamos comprometidos a hacer esto lo más fácil posible para ti.
    </p>
  `;

  return baseEmailTemplate({
    tenantName: data.tenantName,
    tenantLogo: data.tenantLogo,
    title: 'Viaje Cancelado',
    subtitle: `Viaje a ${data.destination}`,
    badge: {
      text: 'VIAJE CANCELADO',
      color: 'yellow',
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
