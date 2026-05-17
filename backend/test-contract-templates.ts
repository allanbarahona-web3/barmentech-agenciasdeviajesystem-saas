/**
 * Script para probar los 3 templates de contratos
 * Ejecutar: npx ts-node test-contract-templates.ts
 */

import { contractPdfAttachmentTemplate } from './src/email/templates/contract-pdf-attachment.template';
import { contractSigningLinkTemplate } from './src/email/templates/contract-signing-link.template';
import { contractSignedConfirmationTemplate } from './src/email/templates/contract-signed-confirmation.template';

// Mock data para pruebas
const mockBranding = {
  tenantName: 'Viajes Alma Nova Test',
  primaryColor: '#8B5CF6',
  secondaryColor: '#EC4899',
  emailLogoUrl: 'https://agencia-viajes-saas.sfo3.digitaloceanspaces.com/tenant-assets/almanova-email-logo.png',
  contactEmail: 'contacto@almanova.com',
  contactWhatsApp: '+1234567890',
  businessAddress: '123 Calle Principal, Ciudad',
  websiteUrl: 'https://almanova.viajesystem.com',
};

console.log('🧪 Probando templates de contratos...\n');

// Test 1: contract-pdf-attachment
console.log('1️⃣ Testing contract-pdf-attachment template...');
try {
  const html1 = contractPdfAttachmentTemplate({
    clientName: 'Juan Pérez',
    contractNumber: 'ALM-2026-00001',
    ...mockBranding,
  });
  
  if (html1.includes('<!DOCTYPE html>') && 
      html1.includes('Juan Pérez') && 
      html1.includes('ALM-2026-00001') &&
      html1.includes('Viajes Alma Nova Test')) {
    console.log('   ✅ contract-pdf-attachment renderiza correctamente');
    console.log(`   📏 Tamaño: ${(html1.length / 1024).toFixed(1)} KB`);
  } else {
    console.log('   ❌ FALLO: Faltan datos esperados en el HTML');
  }
} catch (error: any) {
  console.log(`   ❌ ERROR: ${error.message}`);
}

console.log('');

// Test 2: contract-signing-link
console.log('2️⃣ Testing contract-signing-link template...');
try {
  const html2 = contractSigningLinkTemplate({
    clientName: 'María González',
    contractNumber: 'ALM-2026-00002',
    signingUrl: 'https://almanova.viajesystem.com/sign/abc123xyz',
    ...mockBranding,
  });
  
  if (html2.includes('<!DOCTYPE html>') && 
      html2.includes('María González') && 
      html2.includes('ALM-2026-00002') &&
      html2.includes('https://almanova.viajesystem.com/sign/abc123xyz') &&
      html2.includes('Firmar Contrato')) {
    console.log('   ✅ contract-signing-link renderiza correctamente');
    console.log(`   📏 Tamaño: ${(html2.length / 1024).toFixed(1)} KB`);
    console.log('   🔗 signingUrl encontrado en HTML');
  } else {
    console.log('   ❌ FALLO: Faltan datos esperados en el HTML');
  }
} catch (error: any) {
  console.log(`   ❌ ERROR: ${error.message}`);
}

console.log('');

// Test 3: contract-signed-confirmation
console.log('3️⃣ Testing contract-signed-confirmation template...');
try {
  const html3 = contractSignedConfirmationTemplate({
    recipientName: 'Carlos Rodríguez',
    contractNumber: 'ALM-2026-00003',
    ...mockBranding,
  });
  
  if (html3.includes('<!DOCTYPE html>') && 
      html3.includes('Carlos Rodríguez') && 
      html3.includes('ALM-2026-00003') &&
      html3.includes('Contrato Completado')) {
    console.log('   ✅ contract-signed-confirmation renderiza correctamente');
    console.log(`   📏 Tamaño: ${(html3.length / 1024).toFixed(1)} KB`);
  } else {
    console.log('   ❌ FALLO: Faltan datos esperados en el HTML');
  }
} catch (error: any) {
  console.log(`   ❌ ERROR: ${error.message}`);
}

console.log('\n✨ Pruebas completadas');
