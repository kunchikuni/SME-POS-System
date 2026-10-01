export interface PlanInfo {
  label: string;
  price: number;
  recurring: boolean;
  /** Pays a monthly maintenance fee from the second month (plans bought once). The amount is deliberately not shown on the site. */
  maintenance?: boolean;
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
