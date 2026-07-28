import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUR_AIRPORTS_BASE_URL =
  "https://davidmegginson.github.io/ourairports-data";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const defaultOutput = resolve(
  projectDirectory,
  "src/shared/airports/data/airports.min.json",
);

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readSource(path, filename) {
  if (path) {
    return readFile(resolve(path), "utf8");
  }

  const response = await fetch(`${OUR_AIRPORTS_BASE_URL}/${filename}`);
  if (!response.ok) {
    throw new Error(`Unable to download ${filename}: ${response.status}`);
  }

  return response.text();
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((field) => field.length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

const airportTypePriority = new Map([
  ["large_airport", 4],
  ["medium_airport", 3],
  ["small_airport", 2],
  ["seaplane_base", 1],
]);

function candidatePriority(airport) {
  return (
    (airport.scheduled_service === "yes" ? 100 : 0) +
    (airportTypePriority.get(airport.type) ?? 0)
  );
}

function minimizeAirports(airportRows, countryRows) {
  const countries = new Map(
    countryRows.map((country) => [country.code, country.name]),
  );
  const airportsByIata = new Map();

  for (const airport of airportRows) {
    const iata = airport.iata_code.trim().toUpperCase();
    if (!iata || airport.type === "closed_airport") {
      continue;
    }

    const existing = airportsByIata.get(iata);
    if (existing && candidatePriority(existing) >= candidatePriority(airport)) {
      continue;
    }

    airportsByIata.set(iata, airport);
  }

  return [...airportsByIata.entries()]
    .map(([iata, airport]) => ({
      iata,
      ...(airport.icao_code ? { icao: airport.icao_code.toUpperCase() } : {}),
      name: airport.name,
      city: airport.municipality,
      country: countries.get(airport.iso_country) ?? airport.iso_country,
      countryCode: airport.iso_country,
    }))
    .sort(
      (left, right) =>
        left.iata.localeCompare(right.iata) ||
        left.name.localeCompare(right.name),
    );
}

const airportsPath = readArgument("--airports");
const countriesPath = readArgument("--countries");
const outputPath = resolve(readArgument("--output") ?? defaultOutput);

const [airportsCsv, countriesCsv] = await Promise.all([
  readSource(airportsPath, "airports.csv"),
  readSource(countriesPath, "countries.csv"),
]);
const airports = minimizeAirports(
  parseCsv(airportsCsv),
  parseCsv(countriesCsv),
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(airports)}\n`, "utf8");

console.log(`Generated ${airports.length} airports at ${outputPath}`);
