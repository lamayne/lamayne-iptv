export interface Channel {
  id: string;
  name: string;
  category: string;
  description: string;
  logoColor: string;
  isLive: boolean;
  viewers?: number;
  resolution?: string;
  rating?: number;
  logoUrl?: string;
  streamUrl?: string;
  imported?: boolean;
  watchedAt?: number;
}

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  createdAt: number;
}

export type Page =
  | 'home'
  | 'live'
  | 'player'
  | 'favorites'
  | 'settings'
  | 'movies'
  | 'series';

export type SubPage =
  | 'all'
  | 'categories'
  | 'recently-watched'
  | 'trending'
  | 'continue-watching'
  | 'channels'
  | 'profiles'
  | 'player-settings'
  | 'appearance'
  | 'content-visibility'
  | 'import-playlist'
  | 'about'
  | 'movies'
  | 'series';

export const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export type SourceType = 'm3u' | 'xtream';

export type SourceStatus =
  | 'untested'
  | 'connecting'
  | 'connected'
  | 'error';

export interface IptvSource {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  createdAt: number;
}

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}