export interface PlanInfo {
  label: string;
  price: number;
  recurring: boolean;
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
