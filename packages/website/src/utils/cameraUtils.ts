import { CameraDevice } from '../components/CameraPage';

export interface CameraWithMetadata extends CameraDevice {
  category: 'indoor' | 'outdoor' | 'unknown';
  priority: number;
}

/**
 * Categorize a camera as indoor or outdoor based on its name
 * This is a basic implementation that can be enhanced with more sophisticated logic
 */
export const categorizeCameras = (cameras: CameraDevice[]): CameraWithMetadata[] => {
  return cameras.map(camera => {
    const name = (camera.customName || camera.parentRelations?.[0]?.displayName || camera.name || '').toLowerCase();
    
    // Outdoor indicators
    const outdoorKeywords = ['outdoor', 'front', 'back', 'yard', 'garden', 'porch', 'door', 'driveway', 'entrance', 'gate', 'patio'];
    // Indoor indicators  
    const indoorKeywords = ['indoor', 'living', 'kitchen', 'bedroom', 'office', 'hallway', 'stairs', 'basement'];
    
    let category: 'indoor' | 'outdoor' | 'unknown' = 'unknown';
    
    if (outdoorKeywords.some(keyword => name.includes(keyword))) {
      category = 'outdoor';
    } else if (indoorKeywords.some(keyword => name.includes(keyword))) {
      category = 'indoor';
    }
    
    return {
      ...camera,
      category,
      priority: 0 // Will be set by sorting function
    };
  });
};

/**
 * Get time-based priority for cameras based on current time
 * Returns higher priority (lower number) for more relevant cameras
 */
export const getTimeBasedPriority = (camera: CameraWithMetadata): number => {
  const now = new Date();
  const hour = now.getHours();
  
  // Daytime (6 AM - 6 PM): Prioritize outdoor cameras
  if (hour >= 6 && hour < 18) {
    switch (camera.category) {
      case 'outdoor': return 1;
      case 'indoor': return 2;
      case 'unknown': return 3;
    }
  }
  // Nighttime (6 PM - 6 AM): Prioritize indoor cameras for security
  else {
    switch (camera.category) {
      case 'indoor': return 1;
      case 'outdoor': return 2;
      case 'unknown': return 3;
    }
  }
  
  return 3;
};

/**
 * Sort cameras based on time of day and user preferences
 */
export const sortCamerasWithTimeContext = (
  cameras: CameraDevice[], 
  userPreference?: 'time-based' | 'alphabetical' | 'custom'
): CameraDevice[] => {
  if (userPreference === 'alphabetical') {
    return [...cameras].sort((a, b) => {
      const nameA = a.customName || a.parentRelations?.[0]?.displayName || a.name || '';
      const nameB = b.customName || b.parentRelations?.[0]?.displayName || b.name || '';
      return nameA.localeCompare(nameB);
    });
  }
  
  if (userPreference === 'custom') {
    // Return cameras in their original order for custom arrangement
    return cameras;
  }
  
  // Default: time-based sorting
  const categorizedCameras = categorizeCameras(cameras);
  
  return categorizedCameras
    .map(camera => ({
      ...camera,
      priority: getTimeBasedPriority(camera)
    }))
    .sort((a, b) => {
      // First sort by priority
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then sort alphabetically within same priority
      const nameA = a.customName || a.parentRelations?.[0]?.displayName || a.name || '';
      const nameB = b.customName || b.parentRelations?.[0]?.displayName || b.name || '';
      return nameA.localeCompare(nameB);
    });
};