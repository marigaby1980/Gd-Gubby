export interface GDLevel {
  id: number;
  name: string;
  difficulty: 'Auto' | 'Easy' | 'Normal' | 'Hard' | 'Harder' | 'Insane' | 'Demon';
  stars: number;
  coins: number;
  songName: string;
  songArtist: string;
  color: string;
  bgColor: string;
  description: string;
  length: string;
  objects: number;
}

export interface SaveFile {
  name: string;
  size: number;
  updatedAt: string;
}

export interface GameSettings {
  autoSaveInterval: number; // in seconds
  showTouchControls: boolean;
  aspectRatio: '16:9' | '4:3' | 'fit' | 'fill';
  showFps: boolean;
  soundVolume: number;
  musicVolume: number;
}

export interface LoadingStatus {
  phase: 'idle' | 'fetching' | 'decompressing' | 'initializing' | 'ready' | 'error';
  progressPercent: number;
  loadedMb: number;
  totalMb: number;
  currentTask: string;
  errorMessage?: string;
}
