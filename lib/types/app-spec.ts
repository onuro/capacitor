// App Specification Types for Flux V8

export interface ComponentSpec {
  name: string;
  description: string;
  repotag: string;
  ports: number[];
  containerPorts: number[];
  domains: string[];
  environmentParameters: string[];
  commands: string[];
  containerData: string;
  cpu: number;
  ram: number;
  hdd: number;
  repoauth: string;
  tiered: false;
}

export interface AppSpec {
  version: 8;
  name: string;
  description: string;
  owner: string;
  contacts: string[];
  instances: number;
  staticip: false;
  enterprise: '';
  nodes: [];
  geolocation: [];
  expire: number;
  compose: ComponentSpec[];
}

export interface ValidationResult {
  status: 'success' | 'error';
  data?: {
    message?: string;
    valid?: boolean;
  };
}

export interface PriceResult {
  status: 'success' | 'error';
  data?: {
    priceUSD: number;
    priceFlux: number;
    actualPriceFlux: number;
  };
}

export interface RegisterResult {
  status: 'success' | 'error';
  data?: {
    message?: string;
    hash?: string;
  };
}

export interface DeploymentInfo {
  status: 'success' | 'error';
  data?: {
    address: string;
    height: number;
  };
}

export interface TestResult {
  status: 'success' | 'error';
  data?: string;
}

// Form data types for the wizard
export interface GeneralFormData {
  name: string;
  description: string;
  instances: number;
  contactEmail: string;
}

export interface ComponentFormData {
  name: string;
  description: string;
  repotag: string;
  ports: { external: number; container: number }[];
  environmentParameters: { key: string; value: string }[];
  commands: string;
  containerData: string;
  cpu: number;
  ram: number;
  hdd: number;
}

export interface RegistrationFormData {
  general: GeneralFormData;
  component: ComponentFormData;
}

// Default expiration blocks (post-fork)
export const DEFAULT_EXPIRE_BLOCKS = 88000;

// Resource limits
export const RESOURCE_LIMITS = {
  cpu: { min: 0.1, max: 15, default: 0.5 },
  ram: { min: 100, max: 65536, default: 256 },
  hdd: { min: 1, max: 820, default: 5 },
  instances: { min: 3, max: 100, default: 3 },
} as const;
