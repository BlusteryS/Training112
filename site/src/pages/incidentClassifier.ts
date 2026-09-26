import { api } from '../api';

export type ClassifierCard = {
  code: string;
  type: string;
  sign2: string;
  sign3: string;
  result: string;
  services: string[];
  victim_services: string[];
  district_dds: boolean;
  okrug_dds: boolean;
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

export function matchingCard(cards: ClassifierCard[], type: string, sign2: string, sign3: string) {
  return cards.find((card) => card.type === type && card.sign2 === sign2 && card.sign3 === sign3);
}

export function servicesForCard(card: ClassifierCard | undefined, address: string, district: string,
  okrug: string, victims: string) {
  if (!card || !address.trim()) return [];
  const services = [...card.services];
  if (victims !== 'Нет') services.push(...card.victim_services);
  if (district.trim() && card.district_dds) services.push(`ДДС района ${district.trim()}`);
  if (okrug.trim() && card.okrug_dds) services.push(`ДДС ${okrug.trim()}`);
  return [...new Set(services)];
}
