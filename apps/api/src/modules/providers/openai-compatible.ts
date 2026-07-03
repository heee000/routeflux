import { decryptSecret } from "../../security/crypto.js";
import type { RoutedModel } from "../catalog/types.js";

export interface UpstreamResponse {
  response: Response;
  model: RoutedModel;
}

export async function callOpenAICompatible(
  model: RoutedModel,
  body: Record<string, unknown>,
  masterKey: string,
  signal?: AbortSignal
): Promise<UpstreamResponse> {
  const baseUrl = model.provider.baseUrl.replace(/\/$/, "");
  const apiKey = decryptSecret(model.provider.apiKeyCiphertext, masterKey);
  const payload = { ...body, model: model.upstreamModel };
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {})
  });
  return { response, model };
}
