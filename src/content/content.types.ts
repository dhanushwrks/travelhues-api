export const spotTypes = [
  'stay',
  'food',
  'activity',
  'sightseeing',
  'shop',
] as const;

export type SpotType = (typeof spotTypes)[number];

export type Spot = {
  id: string;
  type: SpotType;
  title: string;
  description: string;
  images: string[];
  lat: number;
  lng: number;
  address: string;
  avgMinutes: number;
  avgCostThb: number;
  tags: string[];
};

export type NoteBlock = {
  kind: 'note';
  body: string;
};

export type SpotBlock = {
  kind: 'spot';
  spotId: string;
  body: string;
};

export type Block = NoteBlock | SpotBlock;

export type Day = {
  title: string;
  blocks: Block[];
};

export type Itinerary = {
  slug: string;
  title: string;
  summary: string;
  coverUrl: string;
  days: Day[];
};

export type Creator = {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
};

export type Destination = {
  name: string;
  country: string;
  lat: number;
  lng: number;
};

export type Story = {
  slug: string;
  title: string;
  summary: string;
  coverUrl: string;
  ownerId?: string;
  destination: Destination;
  creator: Creator;
  spots: Spot[];
  itineraries: Itinerary[];
};

export type ItineraryDetail = {
  story: Story;
  itinerary: Itinerary;
};

export type CreatorProfile = {
  creator: Creator;
  stories: Story[];
};
