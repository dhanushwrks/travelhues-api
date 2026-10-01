export type PurchaseKind = 'spot' | 'itinerary' | 'blog';

export type ContentPurchase = {
  id: string;
  buyerId: string;
  storySlug: string;
  kind: PurchaseKind;
  itemId: string;
  priceInr: number;
  createdAt: string;
};
