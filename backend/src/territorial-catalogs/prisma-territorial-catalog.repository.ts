import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TerritorialCatalogRepository } from "./territorial-catalog.repository";

const safeSubdivisionSelect = {
  id: true,
  administrativeLevel: true,
  subdivisionTypeCode: true,
  code: true,
  fullCode: true,
  name: true,
} as const;

const deterministicOrder = [
  { administrativeLevel: "asc" as const },
  { fullCode: "asc" as const },
  { id: "asc" as const },
];

@Injectable()
export class PrismaTerritorialCatalogRepository implements TerritorialCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveRelease(countryCode: string) {
    return this.prisma.territorialCatalogRelease.findFirst({
      where: { countryCode, status: "ACTIVE" },
      select: { id: true, countryCode: true, version: true },
    });
  }

  findActiveRootSubdivisions(releaseId: string) {
    return this.prisma.territorialSubdivision.findMany({
      where: { releaseId, parentId: null, isActive: true },
      select: safeSubdivisionSelect,
      orderBy: deterministicOrder,
    });
  }

  findActiveSubdivision(releaseId: string, fullCode: string) {
    return this.prisma.territorialSubdivision.findFirst({
      where: { releaseId, fullCode, isActive: true },
      select: safeSubdivisionSelect,
    });
  }

  findActiveChildren(releaseId: string, parentId: string) {
    return this.prisma.territorialSubdivision.findMany({
      where: { releaseId, parentId, isActive: true },
      select: safeSubdivisionSelect,
      orderBy: deterministicOrder,
    });
  }
}
