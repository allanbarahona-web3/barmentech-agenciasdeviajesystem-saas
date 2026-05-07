"use client";

import { useRouter } from "next/navigation";

interface GenericEmailBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  domain: string;
  tenantName?: string;
}

export function GenericEmailBlockedModal({
  isOpen,
  onClose,
  domain,
  tenantName = "tu agencia",
}: GenericEmailBlockedModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  // WhatsApp info para contactar soporte (desde variable de entorno)
  const whatsappNumber = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_NUMBER || "17863918722";
  const whatsappMessage = encodeURIComponent(
    `Hola, necesito ayuda para configurar un email empresarial para ${tenantName}. Actualmente tengo un email con dominio genérico (@${domain}) que no es permitido.`
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  const handleContactWhatsApp = () => {
    window.open(whatsappLink, "_blank");
  };

  const handleContactEmail = () => {
    window.location.href = "mailto:info@barmentech.com?subject=Ayuda con Email Empresarial&body=Hola, necesito ayuda para configurar un email empresarial.";
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideUp">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 p-8 text-white text-center rounded-t-2xl">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-3xl font-bold mb-2">Email Genérico No Permitido</h2>
          <p className="text-red-100 text-lg">Necesitas un dominio empresarial propio</p>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          
          {/* Email ingresado */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-semibold mb-1">Has ingresado:</p>
            <p className="text-lg text-red-900 font-mono">tu-email<span className="text-red-600 font-bold">@{domain}</span></p>
          </div>

          {/* Problema */}
          <div className="border-l-4 border-red-500 pl-4">
            <h3 className="text-xl font-bold text-gray-900 mb-3">❌ ¿Por qué no funciona?</h3>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <span className="text-red-500 mr-2 mt-1">•</span>
                <span>Los emails van directo a <strong>SPAM</strong> (99% de casos)</span>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-2 mt-1">•</span>
                <span>Servidores rechazan el envío (detectan <strong>spoofing</strong>)</span>
              </li>
              <li className="flex items-start">
                <span className="text-red-500 mr-2 mt-1">•</span>
                <span>Imagen <strong>poco profesional</strong> para tus clientes</span>
              </li>
            </ul>
          </div>

          {/* Solución */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
            <h3 className="text-xl font-bold text-green-900 mb-3">✅ Necesitas un Email Empresarial</h3>
            <div className="mb-4">
              <p className="text-gray-700 mb-2">Ejemplo correcto:</p>
              <div className="bg-white border border-green-300 rounded-lg p-3 font-mono text-green-700 font-semibold">
                info@tuempresa.com
              </div>
              <p className="text-sm text-gray-600 mt-1">o contratos@tuempresa.com</p>
            </div>

            {/* Oferta */}
            <div className="bg-white border-2 border-green-400 rounded-lg p-5 mt-4">
              <h4 className="font-bold text-lg text-gray-900 mb-3 flex items-center">
                <span className="text-2xl mr-2">🎁</span>
                ¡Podemos Ayudarte!
              </h4>
              <ul className="space-y-2 text-gray-700 text-sm mb-5">
                <li className="flex items-center">
                  <span className="text-green-600 mr-2">📌</span>
                  <span><strong>Dominio profesional</strong> (tuempresa.com)</span>
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-2">📧</span>
                  <span><strong>Cuentas de correo</strong> con Google Workspace</span>
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-2">⚙️</span>
                  <span><strong>Configuración completa</strong> incluida</span>
                </li>
                <li className="flex items-center">
                  <span className="text-green-600 mr-2">✅</span>
                  <span>Emails <strong>garantizados</strong> (NO spam)</span>
                </li>
              </ul>

              {/* Botones de contacto */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleContactWhatsApp}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </button>
                <button
                  onClick={handleContactEmail}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </button>
              </div>
            </div>
          </div>

          {/* Mientras tanto */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
              <span className="text-xl mr-2">⏩</span>
              Por ahora:
            </h4>
            <p className="text-gray-700 text-sm leading-relaxed">
              Los emails se enviarán desde nuestro sistema: <code className="bg-gray-200 px-2 py-1 rounded text-blue-600">info@barmentech.com</code>
            </p>
            <p className="text-gray-600 text-sm mt-2">
              Tus clientes recibirán los documentos normalmente, pero sin tu branding personalizado.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 rounded-b-2xl flex justify-end border-t">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
}
