import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const api = readSource("../src/lib/cost-engine-api.ts");
const workspace = readSource("../src/features/cost-engine/cost-workspace.tsx");
const categoryLabels = readSource("../src/features/cost-engine/cost-category-label.ts");
const travelPackages = readSource("../src/components/travel-packages-manager.tsx");
const internalTrips = readSource("../src/app/admin/internal-trips/components/internal-trips-list.tsx");

test("uses source-specific resolver routes and does not send tenant or project authority", () => {
  assert.match(api, /\/cost-engine\/travel-packages\/\$\{encodeURIComponent\(travelPackageId\)\}\/costing-project/);
  assert.match(api, /\/cost-engine\/internal-trips\/\$\{encodeURIComponent\(internalTripId\)\}\/costing-project/);
  assert.doesNotMatch(api, /tenantId\s*:/);
});

test("uses the bounded composition response for edit hydration and the live summary", () => {
  assert.match(workspace, /composition\?\.components\.find\(\(item\) => item\.id === componentId\)/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
  assert.match(workspace, /categorySubtotals\.map/);
  assert.match(workspace, /authoritativeTotalCost/);
  assert.match(workspace, /specializedDescription\(component\)/);
  assert.match(api, /pageSize: 20/);
});

test("maps all supported v1 specialized categories and leaves OTHER/custom generic", () => {
  for (const code of ["AIRFARE", "BAGGAGE", "LODGING", "TRANSPORTATION", "TOUR", "INSURANCE", "EVENT_TICKET", "VISA_ASSISTANCE", "MEALS"]) {
    assert.match(workspace, new RegExp(`case "${code}"`));
  }
  assert.match(api, /category\.origin === "CUSTOM" \|\| !SPECIALIZED_STANDARD_CATEGORY_CODES\.has\(category\.code\)/);
  assert.match(workspace, /detailPayload: details, detailSchemaVersion: 1/);
  assert.match(workspace, /hasUnsupportedDetailSchema/);
  assert.match(workspace, /se conservan sin reinterpretarlos/);
});

test("keeps monetary values as exact strings and uses backend totals without recalculation", () => {
  assert.match(workspace, /const MONEY_PATTERN = \/\^\\d\+\(\?:\\\.\\d\{1,5\}\)\?\$\//);
  assert.match(workspace, /amount: form\.amount\.trim\(\)/);
  assert.match(workspace, /quantity: eventTicketCategory \|\| mealsCategory \? form\.quantity\.trim\(\) : genericCategory \? form\.quantity\.trim\(\) \|\| null/);
  assert.doesNotMatch(workspace, /parseFloat\(form\.amount/);
  assert.doesNotMatch(workspace, /Number\(form\.amount/);
  assert.doesNotMatch(workspace, /reduce\([^\n]*authoritativeTotalCost/);
});

test("localizes standard Cost Engine labels without changing their stored codes", () => {
  for (const label of ["Boleto aéreo", "Equipaje", "Hospedaje", "Transporte", "Tour", "Seguro", "Entradas", "Asistencia de visa", "Alimentación", "Otros"]) {
    assert.match(categoryLabels, new RegExp(label));
  }
  for (const label of ["Doble", "Individual", "Triple", "Cuádruple"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /import \{ costCategoryDisplayName \} from "\.\/cost-category-label"/);
  assert.match(categoryLabels, /category\.origin === "CUSTOM" \? category\.displayName/);
  assert.match(workspace, /costCategoryDisplayName\(category\)/);
  assert.match(workspace, /enumValue\(value, field\)/);
  assert.match(workspace, /normalizeCustomCostCategoryCode\(displayName\)/);
});

test("keeps ACCOMMODATION out of the standard selector and folds its fields into Hospedaje", () => {
  assert.match(workspace, /category\.origin === "STANDARD" && category\.code !== "ACCOMMODATION"/);
  assert.doesNotMatch(api.match(/SPECIALIZED_STANDARD_CATEGORY_CODES = new Set\(\[[\s\S]*?\]\);/)?.[0] ?? "", /"ACCOMMODATION"/);
  for (const label of ["Nombre del alojamiento", "Ciudad", "Tipo de hospedaje", "Tipo de habitación", "Check-in", "Check-out", "Noches", "Cantidad de habitaciones"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /lodgingType: enumValue\(string\("lodgingType"\), "lodgingType"\)/);
  assert.match(workspace, /roomType: enumValue\(string\("roomType"\), "roomType"\)/);
  for (const label of ["Hotel", "Hostel", "Airbnb", "Apartamento", "Matrimonial", "Cuádruple"]) {
    assert.match(workspace, new RegExp(label));
  }
});

test("generates the Hospedaje title from specialized data without rendering a manual title field", () => {
  assert.match(workspace, /const lodgingCategory = selectedCategory\?\.code === "LODGING"/);
  assert.match(workspace, /const componentTitle = lodgingCategory \? lodgingComponentTitle\(form\.details\) \|\| form\.title\.trim\(\) : airfareCategory \? airfareComponentTitle\(form\.details\) \|\| form\.title\.trim\(\) : baggageCategory \? baggageComponentTitle/);
  assert.match(workspace, /title: componentTitle/);
  assert.match(workspace, /function lodgingComponentTitle\(values: DetailValues\) \{ return \[values\.propertyName\?\.trim\(\), values\.city\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" - "\); \}/);
  assert.match(workspace, /!polishedSpecializedCategory && !otherCategory \? <div className="grid gap-4 sm:grid-cols-2"><Field label="Título \*">/);
});

test("keeps the approved Hospedaje cost, supporting-information, and edit flow", () => {
  assert.match(workspace, /Costo y proveedor/);
  assert.match(workspace, /Información de respaldo/);
  assert.match(workspace, /<Field label="Referencia \(opcional\)">/);
  assert.match(workspace, /Cotización #1234, correo, WhatsApp o código de reserva/);
  assert.match(workspace, /<Field label="URL de fuente \(opcional\)">/);
  assert.match(workspace, /<EvidenceFields title="Comprobante \(opcional\)"/);
  assert.match(workspace, /!polishedSpecializedCategory && !otherCategory \? <Field label="Observaciones">/);
  assert.match(workspace, /<EvidenceFields title="Comprobante \(opcional\)"[\s\S]*?<Field label="Observaciones">/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
  assert.match(workspace, /\{genericCategory && !otherCategory \? <div className="grid gap-4 sm:grid-cols-2">/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.match(workspace, /updateGenericCostComponent\(selectedComponentId, structural\)/);
});

test("finalizes Boleto aéreo with generated route title and stable specialized values", () => {
  assert.match(workspace, /const airfareCategory = selectedCategory\?\.code === "AIRFARE"/);
  assert.match(workspace, /function airfareComponentTitle\(values: DetailValues\) \{ return \[values\.origin\?\.trim\(\), values\.destination\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" → "\); \}/);
  assert.match(workspace, /flightType: \["INTERNAL", "INTERNATIONAL"\]/);
  assert.match(workspace, /tripType: \["ONE_WAY", "ROUND_TRIP"\]/);
  for (const label of ["Tipo de vuelo", "Tipo de trayecto", "Origen", "Destino", "Fecha de salida", "Aerolínea", "Cabina", "Interno", "Internacional", "Solo ida", "Ida y vuelta", "Económica", "Económica premium", "Ejecutiva", "Primera", "Otra"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /flightType: enumValue\(string\("flightType"\), "flightType"\)/);
  assert.match(workspace, /const tripType = enumValue\(string\("tripType"\), "tripType"\)/);
  assert.match(workspace, /tripType === "ROUND_TRIP" \? date\("returnDate"\) : undefined/);
  assert.match(workspace, /values\.tripType === "ROUND_TRIP" \? text\("Fecha de regreso", "returnDate", "date"\) : null/);
  assert.match(workspace, /if \(field === "cabinClass" && value === "OTHER"\) return "Otra"/);
});

test("keeps Boleto aéreo supporting fields, evidence, and observations without generic quantity or unit", () => {
  assert.match(workspace, /Datos del vuelo/);
  assert.match(workspace, /Cotización, localizador, correo o referencia de tarifa/);
  assert.match(workspace, /Referencia \(opcional\)/);
  assert.match(workspace, /URL de fuente \(opcional\)/);
  assert.match(workspace, /polishedSpecializedCategory \? <>[\s\S]*?<EvidenceFields title="Comprobante \(opcional\)"[\s\S]*?<Field label="Observaciones">/);
  const airfareForm = workspace.slice(workspace.indexOf('case "AIRFARE": return <DetailGrid>'), workspace.indexOf('case "BAGGAGE"'));
  assert.doesNotMatch(airfareForm, /Cantidad|Unidad/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
});

test("finalizes BAGGAGE with a generated title, stable detail values, and an optional same-project AIRFARE relation", () => {
  assert.match(workspace, /const baggageCategory = selectedCategory\?\.code === "BAGGAGE"/);
  assert.match(workspace, /const polishedSpecializedCategory = lodgingCategory \|\| airfareCategory \|\| baggageCategory \|\| eventTicketCategory \|\| insuranceCategory \|\| mealsCategory \|\| tourCategory \|\| transportationCategory \|\| visaAssistanceCategory/);
  assert.match(workspace, /baggageCategory \? baggageComponentTitle\(form\.details, relatedAirfareComponent\)/);
  assert.match(workspace, /function baggageComponentTitle\(values: DetailValues, relatedAirfareComponent: CostComponent \| null\)/);
  assert.match(workspace, /return route \? `\$\{baggageType\} - \$\{route\}` : baggageType/);
  assert.match(workspace, /baggageType: \["CHECKED", "CARRY_ON", "EXCESS", "SPORTS_EQUIPMENT", "OTHER"\]/);
  for (const label of ["Equipaje documentado", "Carry on", "Exceso de equipaje", "Equipo deportivo", "Otro"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /case "BAGGAGE": return <DetailGrid>[\s\S]*select\("Tipo de equipaje", "baggageType"\)[\s\S]*text\("Piezas", "pieces", "number"\)[\s\S]*text\("Peso \(kg\)", "weightKg"[\s\S]*<Field label="Vuelo relacionado">/);
  assert.match(workspace, /<option value="">Sin vuelo específico<\/option>/);
  assert.match(workspace, /relatedAirfareComponentId: optionalString\("relatedAirfareComponentId"\)/);
  assert.match(workspace, /component\.costingProjectId === project\?\.id && component\.status === "ACTIVE" && component\.costCategory\.code === "AIRFARE"/);
  assert.match(workspace, /function airfareComponentOptionLabel\(component: CostComponent\)/);
  assert.match(workspace, /formatBusinessDate\(value\("departureDate"\)\)/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("keeps BAGGAGE specialized without generic title, quantity, unit, or applicability controls", () => {
  const baggageForm = workspace.slice(workspace.indexOf('case "BAGGAGE": return <DetailGrid>'), workspace.indexOf('case "LODGING"'));
  assert.doesNotMatch(baggageForm, /Título|Cantidad|Unidad|Aplicabilidad/);
  assert.match(workspace, /Datos del equipaje/);
  assert.match(workspace, /baggageCategory \? "Ej\. Cotización, correo, WhatsApp o referencia del proveedor"/);
  assert.match(workspace, /<EvidenceFields title="Comprobante \(opcional\)"/);
  assert.match(workspace, /<Field label="Observaciones">/);
  assert.match(workspace, /case "BAGGAGE": return \[text\("pieces"\)[\s\S]*text\("weightKg"\)/);
});

test("finalizes EVENT_TICKET with a generated title, Spanish specialized fields, and integer ticket quantity", () => {
  assert.match(workspace, /const eventTicketCategory = selectedCategory\?\.code === "EVENT_TICKET"/);
  assert.match(workspace, /eventTicketCategory \? eventTicketComponentTitle\(form\.details\)/);
  assert.match(workspace, /function eventTicketComponentTitle\(values: DetailValues\) \{ return \[values\.eventName\?\.trim\(\), values\.city\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" - "\); \}/);
  const eventTicketForm = workspace.slice(workspace.indexOf('case "EVENT_TICKET": return <DetailGrid>'), workspace.indexOf('case "VISA_ASSISTANCE"'));
  for (const label of ["Evento", "Recinto / lugar", "Ciudad", "Fecha del evento", "Cantidad de entradas *"]) {
    assert.match(eventTicketForm, new RegExp(label));
  }
  assert.match(eventTicketForm, /type="number" min="1" step="1" inputMode="numeric" value=\{quantity\}/);
  assert.match(workspace, /validateTicketQuantity\(form\.quantity\)/);
  assert.match(workspace, /function validateTicketQuantity\(value: string\)/);
  assert.match(workspace, /quantity: eventTicketCategory \|\| mealsCategory \? form\.quantity\.trim\(\)/);
  assert.match(workspace, /unit: eventTicketCategory \|\| mealsCategory \? null/);
  assert.match(workspace, /eventTicketCategory \? "Ej\. Reserva, localizador, cotización, correo o WhatsApp"/);
  assert.match(workspace, /case "EVENT_TICKET": return \["Entradas", component\.quantity/);
  assert.match(workspace, /formatBusinessDate\(text\("eventDate"\)\)/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(eventTicketForm, /Título|Unidad|Aplicabilidad|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes INSURANCE with generated coverage title, date-only validity, and no generic controls", () => {
  assert.match(workspace, /const insuranceCategory = selectedCategory\?\.code === "INSURANCE"/);
  assert.match(workspace, /insuranceCategory \? insuranceComponentTitle\(form\.details\)/);
  assert.match(workspace, /function insuranceComponentTitle\(values: DetailValues\) \{ return \(\{ MEDICAL: "Seguro médico", CANCELLATION: "Seguro de cancelación", TRIP_CANCELLATION: "Seguro de cancelación", BAGGAGE: "Seguro de equipaje", COMPREHENSIVE: "Seguro integral", OTHER: "Seguro" \}/);
  assert.match(workspace, /coverageType: \["MEDICAL", "CANCELLATION", "BAGGAGE", "COMPREHENSIVE", "OTHER"\]/);
  for (const label of ["Médica", "Cancelación", "Equipaje", "Integral", "Otro"]) assert.match(workspace, new RegExp(label));
  const insuranceForm = workspace.slice(workspace.indexOf('case "INSURANCE": return <DetailGrid>'), workspace.indexOf('case "EVENT_TICKET"'));
  for (const label of ["Tipo de cobertura", "Inicio de vigencia", "Fin de vigencia", "Monto de cobertura"]) assert.match(insuranceForm, new RegExp(label));
  assert.match(insuranceForm, /text\("Inicio de vigencia", "startDate", "date"\)/);
  assert.match(insuranceForm, /text\("Fin de vigencia", "endDate", "date"\)/);
  assert.match(workspace, /case "INSURANCE": \{ const startDate = date\("startDate"\); const endDate = date\("endDate"\); assertDateOrder\(startDate, endDate, "endDate", "startDate"\);/);
  assert.match(workspace, /coverageAmount: optionalDecimal\("coverageAmount"\)/);
  assert.match(workspace, /insuranceCategory \? "Ej\. Póliza, cotización, correo o referencia del proveedor"/);
  assert.match(workspace, /case "INSURANCE": return \[text\("startDate"\) && `\$\{formatBusinessDate\(text\("startDate"\)\)\}/);
  assert.match(workspace, /Monto de cobertura: \$\{text\("coverageAmount"\)\}/);
  assert.match(workspace, /if \(component\.costCategory\.code === "INSURANCE" && details\.coverageType === "TRIP_CANCELLATION"\) details\.coverageType = "CANCELLATION"/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(insuranceForm, /Título|Cantidad|Unidad|Aplicabilidad|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes MEALS with generated plan title, date-only range, and person quantity", () => {
  assert.match(workspace, /const mealsCategory = selectedCategory\?\.code === "MEALS"/);
  assert.match(workspace, /mealsCategory \? mealComponentTitle\(form\.details\)/);
  assert.match(workspace, /function mealComponentTitle\(values: DetailValues\) \{ return \(\{ BREAKFAST: "Desayuno", LUNCH: "Almuerzo", DINNER: "Cena", HALF_BOARD: "Media pensión", FULL_BOARD: "Pensión completa", ALL_INCLUSIVE: "Todo incluido", OTHER: "Alimentación" \}/);
  assert.match(workspace, /mealPlanType: \["BREAKFAST", "LUNCH", "DINNER", "HALF_BOARD", "FULL_BOARD", "ALL_INCLUSIVE", "OTHER"\]/);
  for (const label of ["Desayuno", "Almuerzo", "Cena", "Media pensión", "Pensión completa", "Todo incluido", "Otro"]) assert.match(workspace, new RegExp(label));
  const mealsForm = workspace.slice(workspace.indexOf('case "MEALS": return <DetailGrid>'), workspace.indexOf("default: return null"));
  for (const label of ["Plan de comidas", "Fecha de inicio", "Fecha final", "Cantidad de personas *"]) assert.match(mealsForm, new RegExp(label));
  assert.match(mealsForm, /type="number" min="1" step="1" inputMode="numeric" value=\{quantity\}/);
  assert.match(workspace, /validateMealPeopleQuantity\(form\.quantity\)/);
  assert.match(workspace, /function validateMealPeopleQuantity\(value: string\)/);
  assert.match(workspace, /quantity: eventTicketCategory \|\| mealsCategory \? form\.quantity\.trim\(\)/);
  assert.match(workspace, /unit: eventTicketCategory \|\| mealsCategory \? null/);
  assert.match(workspace, /case "MEALS": \{ const startDate = date\("startDate"\); const endDate = optionalDate\("endDate"\); assertDateOrder\(startDate, endDate, "endDate", "startDate"\);/);
  assert.match(workspace, /mealsCategory \? "Ej\. Cotización, menú, correo, WhatsApp o referencia del proveedor"/);
  assert.match(workspace, /case "MEALS": return \[text\("startDate"\) && `\$\{formatBusinessDate\(text\("startDate"\)\)\}/);
  assert.match(workspace, /component\.quantity && `\$\{component\.quantity\} \$\{component\.quantity === "1" \? "persona" : "personas"\}`/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(mealsForm, /Título|Cantidad(?! de personas)|Unidad|Aplicabilidad|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes TOUR with generated activity title, compact tour type, and no duration control", () => {
  assert.match(workspace, /const tourCategory = selectedCategory\?\.code === "TOUR"/);
  assert.match(workspace, /tourCategory \? tourComponentTitle\(form\.details\)/);
  assert.match(workspace, /function tourComponentTitle\(values: DetailValues\) \{ return values\.activityName\?\.trim\(\) \?\? ""; \}/);
  assert.match(workspace, /tourType: \["HALF_DAY", "FULL_DAY", "MULTI_DAY", "OTHER"\]/);
  for (const label of ["Medio día", "Día completo", "Varios días", "Otro"]) assert.match(workspace, new RegExp(label));
  const tourForm = workspace.slice(workspace.indexOf('case "TOUR": return <DetailGrid>'), workspace.indexOf('case "INSURANCE"'));
  for (const label of ["Actividad / tour", "Tipo de tour", "Ubicación", "Fecha de servicio"]) assert.match(tourForm, new RegExp(label));
  assert.match(tourForm, /select\("Tipo de tour", "tourType"\)/);
  assert.match(tourForm, /text\("Fecha de servicio", "serviceDate", "date"\)/);
  assert.match(workspace, /case "TOUR": return compact\(\{ activityName: string\("activityName"\), tourType: enumValue\(string\("tourType"\), "tourType"\), location: string\("location"\), serviceDate: date\("serviceDate"\)/);
  assert.match(workspace, /tourCategory \? "Ej\. Cotización, reserva, correo o WhatsApp"/);
  assert.match(workspace, /case "TOUR": return \[enumLabel\(text\("tourType"\)\), text\("location"\), text\("serviceDate"\) && formatBusinessDate\(text\("serviceDate"\)\)\]/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(tourForm, /Título|Cantidad|Unidad|Aplicabilidad|Duración|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes TRANSPORTATION with generated route title and conditional return date", () => {
  assert.match(workspace, /const transportationCategory = selectedCategory\?\.code === "TRANSPORTATION"/);
  assert.match(workspace, /transportationCategory \? transportationComponentTitle\(form\.details\)/);
  assert.match(workspace, /function transportationComponentTitle\(values: DetailValues\) \{ return \[values\.origin\?\.trim\(\), values\.destination\?\.trim\(\)\]\.filter\(Boolean\)\.join\(" → "\); \}/);
  assert.match(workspace, /transportationType: \["PRIVATE_TRANSFER", "SHARED_SHUTTLE", "BUS", "TRAIN", "FERRY", "TAXI_LOCAL", "RENTAL_CAR", "OTHER"\]/);
  for (const label of ["Traslado privado", "Shuttle / traslado compartido", "Autobús", "Tren", "Ferry", "Taxi / transporte local", "Vehículo de alquiler", "Otro", "Solo ida", "Ida y vuelta"]) assert.match(workspace, new RegExp(label));
  const transportationForm = workspace.slice(workspace.indexOf('case "TRANSPORTATION": return <DetailGrid>'), workspace.indexOf('case "TOUR"'));
  for (const label of ["Tipo de transporte", "Tipo de trayecto", "Origen", "Destino", "Fecha de servicio", "Hora", "Fecha de regreso"]) assert.match(transportationForm, new RegExp(label));
  assert.match(transportationForm, /select\("Tipo de trayecto", "tripType"\)/);
  assert.match(transportationForm, /values\.tripType === "ROUND_TRIP" \? text\("Fecha de regreso", "returnDate", "date"\) : null/);
  assert.match(workspace, /\(\(code === "AIRFARE" \|\| code === "TRANSPORTATION"\) && field === "returnDate" && values\.tripType === "ROUND_TRIP"\)/);
  assert.match(workspace, /case "TRANSPORTATION": \{ const tripType = enumValue\(string\("tripType"\), "tripType"\); const serviceDate = date\("serviceDate"\); const returnDate = tripType === "ROUND_TRIP" \? date\("returnDate"\) : optionalDate\("returnDate"\); assertDateOrder\(serviceDate, returnDate, "returnDate", "serviceDate"\);/);
  assert.match(workspace, /serviceTime: optional\(values, "serviceTime", time\)/);
  assert.match(workspace, /transportationCategory \? "Ej\. Cotización, reserva, correo, WhatsApp o referencia del proveedor"/);
  assert.match(workspace, /case "TRANSPORTATION": return \[enumLabel\(text\("transportationType"\)\), enumLabel\(text\("tripType"\)\), text\("serviceDate"\) && formatBusinessDate\(text\("serviceDate"\)\), text\("serviceTime"\)\]/);
  assert.match(workspace, /SHARED_TRANSFER: "SHARED_SHUTTLE", CAR_RENTAL: "RENTAL_CAR", RAIL: "TRAIN"/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(transportationForm, /Título|Cantidad|Unidad|Aplicabilidad|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes VISA_ASSISTANCE with generated visa title and reusable country selection", () => {
  assert.match(workspace, /const visaAssistanceCategory = selectedCategory\?\.code === "VISA_ASSISTANCE"/);
  assert.match(workspace, /visaAssistanceCategory \? visaAssistanceComponentTitle\(form\.details\)/);
  assert.match(workspace, /function visaAssistanceComponentTitle\(values: DetailValues\) \{ const country = getSpanishCountryName\(values\.destinationCountry \?\? ""\) \?\? values\.destinationCountry\?\.trim\(\); const prefix = \(\{ TOURISM: "Visa turística", TOURIST: "Visa turística", BUSINESS: "Visa de negocios", TRANSIT: "Visa de tránsito", STUDENT: "Visa de estudios", WORK: "Visa de trabajo", OTHER: "Asistencia de visa" \}/);
  assert.match(workspace, /visaType: \["TOURISM", "BUSINESS", "TRANSIT", "STUDENT", "WORK", "OTHER"\]/);
  for (const label of ["Turismo", "Negocios", "Tránsito", "Estudios", "Trabajo", "Otro"]) assert.match(workspace, new RegExp(label));
  const visaForm = workspace.slice(workspace.indexOf('case "VISA_ASSISTANCE": return <DetailGrid>'), workspace.indexOf('case "MEALS"'));
  assert.match(visaForm, /<VisaDestinationCountryField value=\{values\.destinationCountry \?\? ""\}/);
  for (const label of ["Tipo de visa", "Fecha esperada de viaje"]) assert.match(visaForm, new RegExp(label));
  assert.match(workspace, /import \{ CountrySelect \} from "@\/components\/country-select"/);
  assert.match(workspace, /import \{ getSpanishCountryName \} from "@\/shared\/countries"/);
  assert.match(workspace, /function VisaDestinationCountryField[\s\S]*<CountrySelect label="País de destino" placeholder="Buscar país" required/);
  assert.match(workspace, /Ingresar manualmente/);
  assert.match(workspace, /Buscar en la lista de países/);
  assert.match(workspace, /case "VISA_ASSISTANCE": return \{ destinationCountry: string\("destinationCountry"\), visaType: enumValue\(string\("visaType"\), "visaType"\), expectedTravelDate: date\("expectedTravelDate"\) \}/);
  assert.match(workspace, /visaAssistanceCategory \? "Ej\. Cotización, trámite, correo, WhatsApp o referencia del proveedor"/);
  assert.match(workspace, /case "VISA_ASSISTANCE": return \[text\("expectedTravelDate"\) && `Viaje previsto: \$\{formatBusinessDate\(text\("expectedTravelDate"\)\)\}`\]/);
  assert.match(workspace, /details\.visaType === "TOURIST"\) details\.visaType = "TOURISM"/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(visaForm, /Título|Cantidad|Unidad|Aplicabilidad|Observaciones/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("finalizes OTHER as an intentionally generic one-off cost form", () => {
  assert.match(workspace, /const otherCategory = selectedCategory\?\.code === "OTHER" && selectedCategory\.origin === "STANDARD"/);
  assert.match(workspace, /!polishedSpecializedCategory && !otherCategory \? <div className="grid gap-4 sm:grid-cols-2"><Field label="Título \*">/);
  const otherForm = workspace.slice(workspace.indexOf(': otherCategory ? <>'), workspace.indexOf(' : <><div className="grid gap-4 sm:grid-cols-2"><Field label={`Costo \*'));
  for (const label of ["Datos del costo", "Título *", "Cantidad (opcional)", "Unidad (opcional)", "Costo y proveedor", "Información de respaldo", "Referencia (opcional)", "URL de fuente (opcional)", "Comprobante (opcional)", "Observaciones"]) assert.match(otherForm, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(otherForm, /placeholder="Ej\. Tasa portuaria, propina obligatoria, permiso especial"/);
  assert.match(otherForm, /placeholder="Ej\. 2"/);
  assert.match(otherForm, /placeholder="Ej\. unidades, noches, días, personas"/);
  assert.match(otherForm, /placeholder="Ej\. Cotización, correo, WhatsApp o referencia del proveedor"/);
  assert.match(workspace, /validateBaseForm\(form, componentTitle\)/);
  assert.match(workspace, /form\.quantity\.trim\(\) && \(!MONEY_PATTERN\.test\(form\.quantity\.trim\(\)/);
  assert.match(workspace, /La cantidad debe ser un decimal exacto mayor que cero/);
  assert.match(workspace, /quantity: eventTicketCategory \|\| mealsCategory \? form\.quantity\.trim\(\) : genericCategory \? form\.quantity\.trim\(\) \|\| null/);
  assert.match(workspace, /unit: eventTicketCategory \|\| mealsCategory \? null : genericCategory \? form\.unit\.trim\(\) \|\| null/);
  assert.match(workspace, /component\.costCategory\.code === "OTHER" \? \(component\.quantity && component\.unit \? `\$\{component\.quantity\} \$\{component\.unit\}`/);
  assert.match(workspace, /\+ Crear nueva opción/);
  assert.match(workspace, /createCostCategory\(\{ code: normalizeCustomCostCategoryCode\(displayName\), displayName \}\)/);
  assert.match(workspace, /formFromComponent\(component\)/);
  assert.doesNotMatch(otherForm, /Aplicabilidad|Motivo \/ observación del costo|Referencia \/ fuente/);
  assert.doesNotMatch(otherForm, /Tipo de vuelo|Tipo de equipaje|Tipo de tour|Tipo de cobertura|Tipo de visa/);
  assert.doesNotMatch(workspace, /getCostComponent\(/);
});

test("removes generic applicability and duplicate cost-note controls from the workspace", () => {
  assert.doesNotMatch(workspace, /Aplicabilidad básica/);
  assert.doesNotMatch(workspace, /createCostApplicability/);
  assert.doesNotMatch(workspace, /Motivo \/ observación del costo/);
  assert.match(workspace, /<Field label="Observaciones">/);
  assert.match(workspace, /reason: initialSnapshot\?\.reason \?\? null/);
});

test("creates a Cost Engine supplier inline and retains the component form", () => {
  assert.match(workspace, /\+ Nuevo proveedor/);
  assert.match(workspace, /<Dialog open=\{showNewSupplier\}/);
  assert.match(workspace, /createCostSupplier\(\{ name, website: newSupplier\.website\.trim\(\) \|\| null, notes: newSupplier\.notes\.trim\(\) \|\| null \}\)/);
  assert.match(workspace, /const refreshed = await listCostSuppliers\(\)/);
  assert.match(workspace, /setForm\(\(current\) => \(\{ \.\.\.current, costSupplierId: created\.id \}\)\)/);
  const supplierHandler = workspace.slice(workspace.indexOf("async function submitNewSupplier"), workspace.indexOf("async function openEvidence"));
  assert.doesNotMatch(supplierHandler, /resetForm\(\)/);
  assert.match(api, /apiPost<CostSupplier>\("\/cost-engine\/suppliers", input\)/);
});

test("keeps generic quantity and unit for OTHER and custom categories", () => {
  assert.match(workspace, /\{genericCategory && !otherCategory \? <div className="grid gap-4 sm:grid-cols-2">/);
  assert.match(workspace, /<Field label="Unidad">/);
  assert.match(workspace, /selectedComponent\?\.quantity \?\? null/);
  assert.match(workspace, /<SpecializedDetailsFields code=\{selectedCategory\.code\}/);
});

test("keeps cost entry before saved components and confirms generic component deactivation", () => {
  assert.ok(workspace.indexOf('<CardHeader><CardTitle>{selectedComponentId ? "Editar componente" : "Agregar componente"}') < workspace.indexOf('<CardHeader><CardTitle>Componentes guardados</CardTitle>'));
  assert.match(workspace, /archiveCostComponent\(component\.id\)/);
  assert.match(workspace, /<Dialog open=\{Boolean\(archiveCandidate\)\}/);
  assert.match(workspace, /Desactivar componente/);
  assert.match(workspace, /Sus costos, comprobantes y auditoría se conservarán/);
  assert.match(workspace, /onArchive=\{\(\) => setArchiveCandidate\(component\)\}/);
  assert.match(workspace, /<Button type="button" size="sm" aria-current="page">Costos<\/Button>/);
  assert.match(workspace, /Pricing · Próximamente/);
  assert.match(workspace, />Historial de costos<\/Button>/);
  assert.doesNotMatch(workspace, /additional-services|Additional Services|pricing-engine/i);
});

test("supports save actions and explicit evidence upload/access through snapshot-scoped routes", () => {
  assert.match(workspace, /Guardar y agregar otro/);
  assert.match(workspace, /Cancelar/);
  assert.match(api, /snapshots\/\$\{encodeURIComponent\(costSnapshotId\)\}\/evidence/);
  assert.match(api, /formData\.append\("file", file\)/);
  assert.match(workspace, /uploadCostEvidence\(snapshotForEvidence\.id, evidenceFile\)/);
  assert.match(workspace, /getCostEvidenceAccess\(evidenceViewer\.snapshotId, attachment\.id\)/);
  assert.doesNotMatch(workspace, /window\.open/);
});

test("adds the ADMIN cost workspace entry point to each travel source", () => {
  assert.match(travelPackages, /\/admin\/cost-engine\/travel-package\/\$\{encodeURIComponent\(pkg\.id\)\}/);
  assert.match(internalTrips, /canComposeCosts \? \(/);
  assert.match(internalTrips, /\/admin\/cost-engine\/internal-trip\/\$\{encodeURIComponent\(trip\.id\)\}/);
});
