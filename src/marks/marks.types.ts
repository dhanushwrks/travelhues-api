export type ContentMark = {
  userId: string;
  action: 'like' | 'save';
  kind: 'itinerary' | 'spot';
  storySlug: string;
  itinerarySlug: string;
  spotId: string;
};
