import React from 'react';

export const DeviceCardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse relative bg-gradient-to-b from-gray-700/30 to-gray-800/60 rounded-lg border border-gray-600/30 overflow-hidden shadow-md hover:shadow-blue-900/10 transition-shadow duration-300">
      {/* Status Indicator */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gray-600/50" />

      {/* Header */}
      <div className="p-4 flex items-center space-x-3 border-b border-gray-600/30 bg-gradient-to-r from-gray-700/30 to-gray-800/20">
        <div className="w-14 h-14 bg-gray-700/70 rounded-lg" />
        <div className="flex-1">
          <div className="h-5 bg-gray-700/70 rounded-md w-3/4 mb-2" />
          <div className="h-3 bg-gray-700/70 rounded-md w-1/2" />
        </div>
        <div className="w-20 h-7 bg-gray-700/70 rounded-full" />
      </div>

      {/* Controls */}
      <div className="p-4">
        {/* Power Button */}
        <div className="w-full h-10 bg-gray-700/70 rounded-lg mb-4" />

        {/* Cycle Modes */}
        <div className="mt-4 pt-3 border-t border-gray-700/20">
          <div className="flex justify-between items-center mb-2.5">
            <div className="h-4 bg-gray-700/70 rounded w-1/3" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-700/70 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceCardSkeleton;
