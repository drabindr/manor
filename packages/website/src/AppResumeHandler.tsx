/**
 * AppResumeHandler - Coordinates widget refresh on iOS app resume
 * 
 * This module listens for iOS app resume events and triggers immediate
 * refresh of all visible widgets to improve the user experience when
 * returning to the app from background.
 */

import { useEffect } from 'react';

// Global registry of widget refresh functions
const widgetRefreshRegistry = new Map<string, () => void>();

// Register a widget's refresh function
export const registerWidgetRefresh = (widgetId: string, refreshFn: () => void) => {
  widgetRefreshRegistry.set(widgetId, refreshFn);
  console.log(`[AppResume] Registered widget: ${widgetId}`);
};

// Unregister a widget's refresh function
export const unregisterWidgetRefresh = (widgetId: string) => {
  widgetRefreshRegistry.delete(widgetId);
  console.log(`[AppResume] Unregistered widget: ${widgetId}`);
};

// Force refresh all registered widgets
export const refreshAllWidgets = () => {
  console.log(`[AppResume] Refreshing ${widgetRefreshRegistry.size} registered widgets`);
  
  widgetRefreshRegistry.forEach((refreshFn, widgetId) => {
    try {
      console.log(`[AppResume] Refreshing widget: ${widgetId}`);
      refreshFn();
    } catch (error) {
      console.error(`[AppResume] Error refreshing widget ${widgetId}:`, error);
    }
  });
};

// Global app resume handler
export const handleAppResume = () => {
  console.log('[AppResume] App resume detected - triggering widget refresh');
  
  // Immediate refresh of all widgets
  refreshAllWidgets();
  
  // Mark user as active to ensure polling resumes
  if (typeof window !== 'undefined') {
    // Trigger activity events to wake up smart polling
    document.dispatchEvent(new Event('mousedown'));
    document.dispatchEvent(new Event('touchstart'));
  }
};

// Hook to set up app resume handling
export const useAppResumeHandler = () => {
  useEffect(() => {
    // Set up global functions for iOS to call
    if (typeof window !== 'undefined') {
      (window as any).handleAppResume = handleAppResume;
      (window as any).refreshAllWidgets = refreshAllWidgets;
    }

    // Listen for custom app resume events
    const handleResumeEvent = (event: CustomEvent) => {
      console.log('[AppResume] Custom resume event received:', event.detail);
      handleAppResume();
    };

    // Listen for visibility change events (when app comes to foreground)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('[AppResume] Document became visible - checking for app resume');
        // Small delay to allow app to stabilize
        setTimeout(() => {
          handleAppResume();
        }, 100);
      }
    };

    // Add event listeners
    window.addEventListener('appResume', handleResumeEvent as EventListener);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    console.log('[AppResume] App resume handlers initialized');

    return () => {
      // Cleanup
      window.removeEventListener('appResume', handleResumeEvent as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      if (typeof window !== 'undefined') {
        delete (window as any).handleAppResume;
        delete (window as any).refreshAllWidgets;
      }
    };
  }, []);
};

// Hook for widgets to register themselves for app resume refresh
export const useWidgetResumeRefresh = (widgetId: string, refreshFn: () => void) => {
  useEffect(() => {
    registerWidgetRefresh(widgetId, refreshFn);
    
    return () => {
      unregisterWidgetRefresh(widgetId);
    };
  }, [widgetId, refreshFn]);
};