export type GlimpseLink = {
  kind: 'story' | 'itinerary' | 'spot';
  storySlug: string;
  itinerarySlug?: string;
  spotId?: string;
  label: string;
};

export type Glimpse = {
  id: string;
  creatorId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  caption: string;
  videoUrl: string;
  posterUrl: string;
  country: string;
  createdAt: string;
  link: GlimpseLink | null;
};

export type GlimpseLike = {
  glimpseId: string;
  userId: string;
};

export type GlimpseComment = {
  id: string;
  glimpseId: string;
  userId: string;
  username: string;
  displayName: string;
  body: string;
  createdAt: string;
};
