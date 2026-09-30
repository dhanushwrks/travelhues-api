export type SpotCatalogItem = {
  slug: string;
  label: string;
  kinds: string[];
};

export const seedSpotCatalog: SpotCatalogItem[] = [
  { slug: "stay", label: "Stay", kinds: ["Hotel", "Guesthouse", "Homestay"] },
  { slug: "food", label: "Food", kinds: ["Restaurant", "Cafe", "Street food"] },
  { slug: "activity", label: "Activity", kinds: ["Trek", "Class", "Boat", "Walk"] },
  { slug: "sightseeing", label: "Sightseeing", kinds: ["Temple", "Viewpoint", "Neighborhood"] },
  { slug: "shop", label: "Shop", kinds: ["Market", "Boutique"] },
];
