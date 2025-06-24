/**
 * Simple performance monitoring utility
 * Provides basic performance tracking without external dependencies
 */

export default {
  init() {
    // Simple initialization - could add performance observers here
    if (typeof window !== 'undefined' && window.performance) {
      console.log('Performance monitoring initialized');
    }
  },
  
  now() {
    return performance.now();
  },
  
  mark(name: string) {
    if (typeof window !== 'undefined' && window.performance && window.performance.mark) {
      window.performance.mark(name);
    }
  },
  
  measure(name: string, startMark: string, endMark: string) {
    if (typeof window !== 'undefined' && window.performance && window.performance.measure) {
      try {
        window.performance.measure(name, startMark, endMark);
      } catch (e) {
        // Ignore errors if marks don't exist
      }
    }
  }
};
