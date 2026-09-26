import { api } from '../api';

export type ClassifierCard = {
  code: string;
  type: string;
  sign2: string;
  sign3: string;
  result: string;
  services: string[];
  victim_services: string[];
  law_services: string[];
  district_dds: boolean;
  okrug_dds: boolean;
  tinao_dds: boolean;
};

let catalogRequest: Promise<ClassifierCard[]> | undefined;

export function incidentClassifier() {
  catalogRequest ??= api<ClassifierCard[]>('training/classifier').catch((error: unknown) => {
    catalogRequest = undefined;
    throw error;
  });
  return catalogRequest;
}

export function incidentOptions(cards: ClassifierCard[], type: string, sign2?: string) {
  const rows = cards.filter((card) => card.type === type && (sign2 === undefined || card.sign2 === sign2));
  return [...new Set(rows.map((card) => sign2 === undefined ? card.sign2 : card.sign3).filter(Boolean))];
}

export function matchingCard(cards: ClassifierCard[], type: string, sign2: string, sign3: string, code = '') {
  const matches = cards.filter((card) => card.type === type && card.sign2 === sign2 && card.sign3 === sign3);
  return matches.length === 1 ? matches[0] : matches.find((card) => card.code === code);
}

export function servicesForCard(card: ClassifierCard | undefined, address: string, district: string,
  okrug: string, victims: string, lawViolation: boolean) {
  if (!card || !address.trim()) return [];
  const services = [...card.services];
  if (victims.trim() && victims !== 'Нет') services.push(...card.victim_services);
  if (lawViolation) services.push(...card.law_services);
  const local = okrug === 'ТиНАО' ? card.tinao_dds : card.district_dds;
  if (district.trim() && local) services.push(`ДДС района ${district.trim()}`);
  if (okrug.trim() && (okrug === 'ТиНАО' ? card.tinao_dds : card.okrug_dds))
    services.push(`ДДС ${okrug.trim()}`);
  return [...new Set(services)];
}
