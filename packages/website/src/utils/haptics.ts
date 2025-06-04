// Utility to trigger vibration feedback on mobile devices if supported
// Use this for important state changes to provide haptic feedback

export const triggerHapticFeedback = (pattern?: number | number[]) => {
  if (!window.navigator.vibrate) return false;
  
  try {
    if (pattern) {
      return window.navigator.vibrate(pattern);
    }
    
    // Default subtle tap feedback
    return window.navigator.vibrate(15);
  } catch (e) {
    console.error('Haptic feedback error:', e);
    return false;
  }
};

// Predefined haptic patterns
export const hapticPatterns = {
  SUCCESS: [15, 50, 15],
  ERROR: [50, 100, 50],
  WARNING: [20, 40, 20],
  NOTIFICATION: 15,
};
