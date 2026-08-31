export interface ActiveTerritorialRelease {
  id: string;
  countryCode: string;
  version: string;
}

export interface TerritorialSubdivisionRecord {
  id: string;
  administrativeLevel: number;
  subdivisionTypeCode: string;
  code: string;
  fullCode: string;
  name: string;
}

export interface TerritorialSubdivisionResponse {
  countryCode: string;
  release: { version: string };
  parent: TerritorialSubdivisionRecord | null;
  subdivisions: TerritorialSubdivisionRecord[];
}
