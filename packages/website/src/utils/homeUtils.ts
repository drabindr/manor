/**
 * Utility functions for home-related operations
 */

/**
 * Extracts the home ID from the current URL's subdomain
 * @returns The home ID (subdomain) or default fallback
 */
export const getHomeIdFromUrl = (): string => {
  if (typeof window === 'undefined') {
    return '720frontrd'; // Default fallback for SSR
  }
  
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  
  // Check if it's a subdomain pattern (e.g., 720frontrd.mymanor.click)
  if (parts.length >= 3 && parts[1] === 'mymanor') {
    return parts[0];
  }
  
  // Fallback to default
  return '720frontrd';
};

/**
 * Converts a home ID to a friendly display name
 * @param homeId The home ID (e.g., "720frontrd")
 * @returns Friendly home name (e.g., "720 Front Rd")
 */
export const formatHomeName = (homeId: string): string => {
  if (!homeId) {
    return 'Home';
  }
  
  // Handle the specific case of "720frontrd" -> "720 Front Rd"
  if (homeId.toLowerCase() === '720frontrd') {
    return '720 Front Rd';
  }
  
  // General pattern: split numbers and letters, handle common abbreviations
  let formatted = homeId
    // Insert space between numbers and letters
    .replace(/(\d+)([a-zA-Z])/g, '$1 $2')
    // Insert space between lowercase and uppercase
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Handle common street abbreviations (case insensitive)
    .replace(/(\s|^)frontrd(\s|$)/gi, '$1Front Rd$2')
    .replace(/(\s|^)front(\s|$)/gi, '$1Front$2')
    .replace(/(\s|^)mainst(\s|$)/gi, '$1Main St$2')
    .replace(/(\s|^)oakave(\s|$)/gi, '$1Oak Ave$2')
    .replace(/(\s|^)elmdr(\s|$)/gi, '$1Elm Dr$2')
    .replace(/\brd\b/gi, 'Rd')
    .replace(/\bst\b/gi, 'St')
    .replace(/\bave\b/gi, 'Ave')
    .replace(/\bdr\b/gi, 'Dr')
    .replace(/\bln\b/gi, 'Ln')
    .replace(/\bct\b/gi, 'Ct')
    .replace(/\bpl\b/gi, 'Pl');
  
  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return formatted;
};

/**
 * Gets the formatted home name from the current URL
 * @returns Friendly home name based on current subdomain
 */
export const getCurrentHomeName = (): string => {
  const homeId = getHomeIdFromUrl();
  return formatHomeName(homeId);
};