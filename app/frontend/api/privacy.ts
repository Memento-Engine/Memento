import { getBaseUrl } from "./base";

// Types matching the Rust API
export type MaskedItemType = "web" | "app";

export interface MaskedItem {
  id: number;
  name: string;
  item_type: string;
  created_at: string;
  updated_at: string;
}

export interface MaskedItemsListResponse {
  items: MaskedItem[];
  total: number;
}

export interface CreateMaskedItemRequest {
  name: string;
  item_type: MaskedItemType;
}

export interface UpdateMaskedItemRequest {
  name: string;
}

export interface PrivacyResult {
  success: boolean;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/**
 * List all masked items, optionally filtered by type
 */
export async function listMaskedItems(
  type?: MaskedItemType
): Promise<MaskedItemsListResponse> {
  const baseUrl = await getBaseUrl();
  const url = type
    ? `${baseUrl}/privacy/masked?type=${type}`
    : `${baseUrl}/privacy/masked`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to list masked items: ${response.statusText}`);
  }

  const result: ApiResponse<MaskedItemsListResponse> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to list masked items");
  }

  return result.data;
}

/**
 * Search masked items by name
 */
export async function searchMaskedItems(
  query: string
): Promise<MaskedItemsListResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/privacy/masked/search?q=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Failed to search masked items: ${response.statusText}`);
  }

  const result: ApiResponse<MaskedItemsListResponse> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to search masked items");
  }

  return result.data;
}

/**
 * Create a new masked item
 */
export async function createMaskedItem(
  request: CreateMaskedItemRequest
): Promise<MaskedItem> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/privacy/masked`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to create masked item: ${response.statusText}`);
  }

  const result: ApiResponse<MaskedItem> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to create masked item");
  }

  return result.data;
}

/**
 * Update a masked item
 */
export async function updateMaskedItem(
  id: number,
  request: UpdateMaskedItemRequest
): Promise<MaskedItem> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/privacy/masked/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to update masked item: ${response.statusText}`);
  }

  const result: ApiResponse<MaskedItem> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to update masked item");
  }

  return result.data;
}

/**
 * Delete a masked item
 */
export async function deleteMaskedItem(id: number): Promise<PrivacyResult> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/privacy/masked/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to delete masked item: ${response.statusText}`);
  }

  const result: ApiResponse<PrivacyResult> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to delete masked item");
  }

  return result.data;
}
