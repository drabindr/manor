import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { MediaPlayerInstance } from '@vidstack/react';

export interface PlayerContextValue {
  setPlayer(player: MediaPlayerInstance | null): void;
}

export const PlayerContext = createContext<PlayerContextValue>({
  setPlayer: () => {},
});

interface PlayerProviderProps {
  children: ReactNode;
}

export const PlayerProvider: React.FC<PlayerProviderProps> = ({ children }) => {
  const [player, setPlayer] = useState<MediaPlayerInstance | null>(null);

  return (
    <PlayerContext.Provider value={{ setPlayer }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);
