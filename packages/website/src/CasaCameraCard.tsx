import React, { forwardRef } from 'react';
import HlsCameraCard, { HlsCameraConfig } from './HlsCameraCard';

export interface CasaCameraConfig {
  streamId: string;
  streamPath: string;
  streamType: 'casa' | 'doorbell';
  websocketUrl?: string;
  startCommand: string;
  stopCommand: string;
  displayName: string;
  iconColor?: string;
}

interface CasaCameraCardProps {
  config?: CasaCameraConfig;
}

const CasaCameraCard = forwardRef<HTMLDivElement, CasaCameraCardProps>(({ config }, ref) => {
  // Default to main casa camera config if none provided
  const defaultConfig: CasaCameraConfig = {
    streamId: 'camera_main',
    streamPath: 'live-stream',
    streamType: 'casa',
    startCommand: 'start_live_stream',
    stopCommand: 'stop_live_stream',
    displayName: 'Casa Camera',
    iconColor: 'text-blue-400'
  };

  const finalConfig = { ...defaultConfig, ...config };
  
  const hlsConfig: HlsCameraConfig = {
    streamId: finalConfig.streamId,
    streamPath: finalConfig.streamPath,
    streamType: finalConfig.streamType,
    websocketUrl: finalConfig.websocketUrl || 'wss://i376i8tps1.execute-api.us-east-1.amazonaws.com/prod',
    startCommand: finalConfig.startCommand,
    stopCommand: finalConfig.stopCommand,
    displayName: finalConfig.displayName,
    icon: finalConfig.streamType === 'doorbell' ? (
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={finalConfig.iconColor || "text-orange-400"}
      >
        <path d="M6 16V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12"/>
        <path d="M6 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/>
        <path d="M14 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/>
        <path d="M12 8v4"/>
        <path d="M12 16h.01"/>
      </svg>
    ) : (
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className={finalConfig.iconColor || "text-blue-400"}
      >
        <path d="M23 7l-7 5 7 5V7z"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    )
  };

  return <HlsCameraCard ref={ref} config={hlsConfig} />;
});

CasaCameraCard.displayName = 'CasaCameraCard';

export default CasaCameraCard;
