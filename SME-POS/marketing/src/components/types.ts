export interface PlanInfo {
  label: string;
  price: number;
  recurring: boolean;
  /** Monthly upkeep charged from the second month, for plans bought once. */
  maintenance?: number;
  branches: number | null;
  best_for: string;
  features: string[];
}

export interface HardwareInfo {
  label: string;
  price: number;
}

export interface BusinessTierInfo {
  label: string;
  description: string;
  features: string[];
}
