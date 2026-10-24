import React from 'react';
import { GameCanvas } from './components/GameCanvas';

export const App: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex flex-col">
      <GameCanvas />
    </div>
  );
};

export default App;
