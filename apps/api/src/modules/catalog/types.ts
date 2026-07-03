export interface ProviderRecord {
  id: string;
  slug: string;
  displayName: string;
  baseUrl: string;
  apiKeyCiphertext: string;
  enabled: boolean;
  priority: number;
  timeoutMs: number;
}

export interface ModelRecord {
  id: string;
  providerId: string;
  slug: string;
  upstreamModel: string;
  displayName: string;
  enabled: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJson: boolean;
  domains: Record<string, number>;
  metadata: Record<string, unknown>;
}

export interface RoutedModel extends ModelRecord {
  provider: ProviderRecord;
}

