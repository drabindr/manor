import axios from 'axios';

interface UserProfile {
  userId: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
}

interface UserProfilesResponse {
  profiles: UserProfile[];
}

class UserProfilesService {
  private static instance: UserProfilesService;
  private cache: Map<string, UserProfile> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly ADMIN_API_BASE_URL = "https://nocd1rav49.execute-api.us-east-1.amazonaws.com/prod";

  private constructor() {}

  static getInstance(): UserProfilesService {
    if (!UserProfilesService.instance) {
      UserProfilesService.instance = new UserProfilesService();
    }
    return UserProfilesService.instance;
  }

  /**
   * Get display name for a user, using cache first, then API
   */
  async getUserDisplayName(userId: string, homeId: string): Promise<string> {
    const profile = await this.getUserProfile(userId, homeId);
    return this.getDisplayNameFromProfile(profile, userId);
  }

  /**
   * Get multiple user display names efficiently
   */
  async getUserDisplayNames(userIds: string[], homeId: string): Promise<Record<string, string>> {
    const profiles = await this.getUserProfiles(userIds, homeId);
    const displayNames: Record<string, string> = {};
    
    profiles.forEach(profile => {
      displayNames[profile.userId] = this.getDisplayNameFromProfile(profile, profile.userId);
    });

    return displayNames;
  }

  /**
   * Get user profile from cache or API
   */
  async getUserProfile(userId: string, homeId: string): Promise<UserProfile | null> {
    // Check cache first
    const cached = this.getCachedProfile(userId);
    if (cached) {
      return cached;
    }

    // Fetch from API
    const profiles = await this.fetchUserProfiles([userId], homeId);
    return profiles.find(p => p.userId === userId) || null;
  }

  /**
   * Get multiple user profiles efficiently with batching
   */
  async getUserProfiles(userIds: string[], homeId: string): Promise<UserProfile[]> {
    const uncachedUserIds: string[] = [];
    const results: UserProfile[] = [];

    // Check cache for each user
    userIds.forEach(userId => {
      const cached = this.getCachedProfile(userId);
      if (cached) {
        results.push(cached);
      } else {
        uncachedUserIds.push(userId);
      }
    });

    // Fetch uncached profiles from API
    if (uncachedUserIds.length > 0) {
      const fetchedProfiles = await this.fetchUserProfiles(uncachedUserIds, homeId);
      results.push(...fetchedProfiles);
    }

    return results;
  }

  /**
   * Clear cache for specific user or all users
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
      this.cacheTimestamps.delete(userId);
    } else {
      this.cache.clear();
      this.cacheTimestamps.clear();
    }
  }

  /**
   * Get cached profile if valid
   */
  private getCachedProfile(userId: string): UserProfile | null {
    const cached = this.cache.get(userId);
    const timestamp = this.cacheTimestamps.get(userId);
    
    if (cached && timestamp && (Date.now() - timestamp) < this.CACHE_DURATION) {
      return cached;
    }
    
    // Clean up expired cache
    if (cached) {
      this.cache.delete(userId);
      this.cacheTimestamps.delete(userId);
    }
    
    return null;
  }

  /**
   * Fetch user profiles from API
   */
  private async fetchUserProfiles(userIds: string[], homeId: string): Promise<UserProfile[]> {
    try {
      const response = await axios.post<UserProfilesResponse>(
        `${this.ADMIN_API_BASE_URL}/user-profiles`,
        {
          homeId,
          userIds,
        }
      );

      const profiles = response.data.profiles || [];
      
      // Cache the results
      profiles.forEach(profile => {
        this.cache.set(profile.userId, profile);
        this.cacheTimestamps.set(profile.userId, Date.now());
      });

      return profiles;
    } catch (error) {
      console.error('Error fetching user profiles:', error);
      return [];
    }
  }

  /**
   * Extract display name from profile with fallback logic
   */
  private getDisplayNameFromProfile(profile: UserProfile | null, userId: string): string {
    if (!profile) {
      return this.getUuidFallback(userId);
    }

    // 1. Use custom display name if set
    if (profile.displayName && profile.displayName.trim()) {
      return profile.displayName;
    }

    // 2. Use actual name from Cognito if available
    if (profile.givenName && profile.familyName) {
      return `${profile.givenName} ${profile.familyName}`.trim();
    }

    // 3. Use first name only if available
    if (profile.givenName) {
      return profile.givenName;
    }

    // 4. Use last name only if available
    if (profile.familyName) {
      return profile.familyName;
    }

    // 5. Fall back to UUID truncation
    return this.getUuidFallback(userId);
  }

  /**
   * Get UUID fallback display name
   */
  private getUuidFallback(userId: string): string {
    return userId.substring(0, 5) + '...';
  }
}

export default UserProfilesService;