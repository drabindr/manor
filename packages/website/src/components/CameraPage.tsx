import React, { useState } from 'react';
import { UilVideo, UilListUl, UilApps, UilExpandArrows, UilHistory } from "@iconscout/react-unicons";
import CameraCard from '../CameraCard';
import CasaCameraCard from '../CasaCameraCard';

export type CameraDevice = {
  name: string;
  type: string;
  traits: any;
  customName?: string;
  parentRelations?: { displayName: string | null }[];
};

interface CameraPageProps {
  cameras: CameraDevice[];
  onExpandCamera: (cameraName: string) => void;
  cameraRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  casaCameraRef: React.MutableRefObject<HTMLDivElement | null>;
}

const CameraPage: React.FC<CameraPageProps> = ({ 
  cameras, 
  onExpandCamera, 
  cameraRefs, 
  casaCameraRef 
}) => {
  const [cameraViewMode, setCameraViewMode] = useState<"grid" | "list">("grid");
  // State for number of cameras per row (2 default, cycle to 3 and 4)
  const [columns, setColumns] = useState<number>(2);

  if (cameras.length === 0) {
    return (
      <div className="w-full p-8 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black border border-gray-800/40 rounded-xl m-4 h-96">
        <div className="animate-pulse flex flex-col items-center justify-center h-full">
          <div className="relative mb-6">
            <UilVideo size={56} className="text-gray-600" />
            <div className="absolute inset-0 bg-blue-400 blur-xl opacity-10 rounded-full animate-ping-slow"></div>
          </div>
          <p className="text-gray-300 font-medium text-lg mb-2">Loading camera feeds</p>
          <p className="text-gray-500 text-sm mb-6">Please wait while we connect to your cameras</p>
          <div className="w-56 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-blue-500 animate-gradient-x"
              style={{ width: "60%" }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-page-container w-full overflow-visible pt-2 pb-4 bg-gradient-to-b from-gray-900 to-black">
      <div className="mx-4 mb-4 flex items-center justify-between bg-black/30 backdrop-blur-md rounded-xl p-3 border border-gray-800/40 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="bg-gray-800/70 p-2 rounded-lg">
            <UilVideo className="text-blue-400" size={22} />
          </div>
          <h2 className="text-gray-200 font-medium">Camera Feeds</h2>
        </div>
        <div className="flex items-center space-x-3">
          <div className="text-xs text-gray-400 bg-gray-800/50 px-2.5 py-1 rounded-full border border-gray-700/30">
            {cameras.length + 1} cameras online
          </div>
          <button
            onClick={() => setCameraViewMode(prev => prev === "grid" ? "list" : "grid")}
            className="bg-gray-800/70 hover:bg-gray-700/80 p-2 rounded-lg transition-all duration-200 border border-gray-700/30"
            aria-label={`Switch to ${cameraViewMode === "grid" ? "list" : "grid"} view`}
          >
            {cameraViewMode === "grid" ? (
              <UilListUl className="text-blue-400" size={20} />
            ) : (
              <UilApps className="text-blue-400" size={20} />
            )}
          </button>
          {/* Button to cycle columns per row: 2 (default), 3, 4 */}
          <button
            onClick={() => {
              setCameraViewMode('grid');
              setColumns((prev) => (prev === 4 ? 2 : prev + 1));
            }}
            className="bg-gray-800/70 hover:bg-gray-700/80 p-2 rounded-lg transition-all duration-200 border border-gray-700/30"
            aria-label={`Set columns per row (currently ${columns})`}
          >
            {columns}
          </button>
        </div>
      </div>
      <div
        className="px-4 grid gap-4"
        style={{
          gridTemplateColumns:
            cameraViewMode === 'grid'
              ? `repeat(${columns}, minmax(0, 1fr))`
              : 'repeat(1, minmax(0, 1fr))',
        }}
      >
        {cameras.map((camera) => (
          <div
            key={camera.name}
            onClick={() => onExpandCamera(camera.name)}
            className={`camera-card relative transition-all transform hover:scale-[1.02] cursor-pointer rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-gray-800/50 hover:ring-blue-500/30 hover:shadow-blue-900/20 group ${
              cameraViewMode === "list" ? "aspect-video" : ""
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-30 group-hover:opacity-60 transition-opacity duration-300 z-10"></div>
            <div className="absolute top-2 left-2 z-20 bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-700/50 shadow-lg">
              <div className="flex items-center space-x-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span>{camera.customName || camera.parentRelations?.[0]?.displayName || "Camera"}</span>
              </div>
            </div>
            <div className="group h-full">
              <CameraCard camera={camera} ref={(el) => (cameraRefs.current[camera.name] = el)} />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                <button className="bg-black/60 hover:bg-black/80 text-white px-3 py-2.5 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-xl camera-button">
                  <UilExpandArrows size={18} />
                  <span className="font-medium button-text">Fullscreen</span>
                </button>
              </div>
            </div>
          </div>
        ))}
        <div
          onClick={() => onExpandCamera("CasaCam")}
          className={`camera-card relative transition-all transform hover:scale-[1.02] cursor-pointer rounded-xl overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-gray-800/50 hover:ring-blue-500/30 hover:shadow-blue-900/20 group ${
            cameraViewMode === "list" ? "aspect-video" : ""
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 opacity-30 group-hover:opacity-60 transition-opacity duration-300 z-10"></div>
          <div className="absolute top-2 left-2 z-20 bg-black/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-700/50 shadow-lg">
            <div className="flex items-center space-x-1.5">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span>Casa Camera</span>
            </div>
          </div>
          <div className="group h-full">
            <CasaCameraCard ref={casaCameraRef} />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 space-x-3">
              <button
                className="bg-black/60 hover:bg-black/80 text-white px-3 py-2.5 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-xl camera-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpandCamera("CasaCam");
                }}
              >
                <UilExpandArrows size={18} />
                <span className="font-medium button-text">Fullscreen</span>
              </button>
              <button
                className="bg-black/60 hover:bg-black/80 text-white px-3 py-2.5 rounded-full border border-gray-700/50 backdrop-blur-sm transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-xl camera-button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof window !== "undefined") {
                    // Use react-router navigation if available
                    if ((window as any).navigateToCasaHistory) {
                      (window as any).navigateToCasaHistory();
                    } else {
                      window.location.href = "/casa-camera-history";
                    }
                  }
                }}
              >
                <UilHistory size={18} />
                <span className="font-medium button-text">History</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraPage;
