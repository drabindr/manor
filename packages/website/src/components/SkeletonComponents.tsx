import React from 'react';

export const CameraCardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse relative bg-gradient-to-b from-gray-700/30 to-gray-800/60 rounded-lg border border-gray-600/30 overflow-hidden shadow-md hover:shadow-blue-900/10 transition-shadow duration-300">
      {/* Camera Stream Area */}
      <div className="aspect-video bg-gray-700/70 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 bg-gray-600/70 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 bg-gray-500/70 rounded" />
          </div>
        </div>
        
        {/* Loading indicator overlay */}
        <div className="absolute bottom-2 left-2 bg-gray-600/80 rounded px-2 py-1">
          <div className="h-3 bg-gray-500/70 rounded w-16" />
        </div>
      </div>

      {/* Camera Info */}
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-700/70 rounded w-3/4 mb-1" />
            <div className="h-3 bg-gray-700/70 rounded w-1/2" />
          </div>
          <div className="w-8 h-8 bg-gray-700/70 rounded-full ml-2" />
        </div>
      </div>
    </div>
  );
};

export const ThermostatSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse bg-gradient-to-br from-blue-900/20 via-purple-900/10 to-gray-900/30 backdrop-blur-sm rounded-xl border border-blue-400/20 shadow-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-6 bg-gray-700/70 rounded w-1/3" />
        <div className="w-6 h-6 bg-gray-700/70 rounded" />
      </div>

      {/* Temperature Display */}
      <div className="text-center mb-6">
        <div className="h-16 bg-gray-700/70 rounded-lg w-32 mx-auto mb-2" />
        <div className="h-4 bg-gray-700/70 rounded w-24 mx-auto" />
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-gray-700/70 rounded w-1/4" />
          <div className="flex space-x-2">
            <div className="w-8 h-8 bg-gray-700/70 rounded" />
            <div className="w-16 h-8 bg-gray-700/70 rounded" />
            <div className="w-8 h-8 bg-gray-700/70 rounded" />
          </div>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="h-4 bg-gray-700/70 rounded w-1/4" />
          <div className="flex space-x-2">
            <div className="w-16 h-8 bg-gray-700/70 rounded" />
            <div className="w-16 h-8 bg-gray-700/70 rounded" />
            <div className="w-16 h-8 bg-gray-700/70 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const LightControlSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse space-y-4">
      {/* Room Header */}
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-gray-700/70 rounded" />
        <div className="h-6 bg-gray-700/70 rounded w-1/3" />
      </div>

      {/* Light Switches */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gradient-to-b from-gray-700/30 to-gray-800/60 rounded-lg border border-gray-600/30 p-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-700/70 rounded" />
              <div className="flex-1">
                <div className="h-4 bg-gray-700/70 rounded w-3/4 mb-1" />
                <div className="h-3 bg-gray-700/70 rounded w-1/2" />
              </div>
              <div className="w-12 h-6 bg-gray-700/70 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default { CameraCardSkeleton, ThermostatSkeleton, LightControlSkeleton };