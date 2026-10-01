export type SpotType = string;

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
  archived?: boolean;
  deletedAt?: string | null;
};

export type NoteBlock = {
  kind: 'note';
  body: string;
};

export type CommuteMode = 'walk' | 'cycle' | 'cab' | 'public' | 'self_drive' | 'flight';

export type CommuteLeg = {
  mode: CommuteMode;
  notes?: string;
  minutes?: number;
  costThb?: number;
  mapsMinutes?: number;
  mapsDistanceM?: number;
  minutesSource?: 'manual' | 'maps' | 'maps_overridden';
};

export type SpotBlock = {
  kind: 'spot';
  spotId: string;
  body: string;
  commute?: CommuteLeg;
};

export type Block = NoteBlock | SpotBlock;

export type Day = {
  title: string;
  brief?: string;
  blocks: Block[];
};

export type ReservationType = 'stay' | 'rental' | 'flight' | 'experience';

export type Reservation = {
  id: string;
  type: ReservationType;
  title: string;
  spotId?: string;
  fromDay: number;
  toDay: number;
  fromPlace?: string;
  toPlace?: string;
  rentalKind?: 'car' | 'bike' | 'scooter';
  estCostThb?: number;
  link?: string;
  notes?: string;
  airline?: string;
  flightNumber?: string;
  timeOfDay?: string;
};

export type Itinerary = {
  slug: string;
  title: string;
  summary: string;
  coverUrl: string;
  days: Day[];
  reservations?: Reservation[];
  archived?: boolean;
  deletedAt?: string | null;
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

export type StoryBlog = {
  slug: string;
  title: string;
  body: string;
  coverUrl: string;
  archived?: boolean;
  deletedAt?: string | null;
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
  blogs: StoryBlog[];
  archived?: boolean;
  deletedAt?: string | null;
};

export type ItineraryDetail = {
  story: Story;
  itinerary: Itinerary;
};

export type CreatorProfile = {
  creator: Creator;
  stories: Story[];
};
