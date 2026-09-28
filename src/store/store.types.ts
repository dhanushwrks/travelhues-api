export type AppSettings = {
  name: string;
  tagline: string;
  publicUrl: string;
  mapsEnabled: boolean;
};

export type ApiSettings = {
  corsOrigins: string[];
  contentPublished: boolean;
};

export type Settings = {
  app: AppSettings;
  api: ApiSettings;
};

export type PublicSettings = {
  app: AppSettings;
  contentPublished: boolean;
};
