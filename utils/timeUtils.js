// utils/timeUtils.js - Utilities for handling time and time zones

// Define time zones list directly
const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',     // Eastern Time
  'America/Chicago',      // Central Time
  'America/Denver',       // Mountain Time
  'America/Los_Angeles',  // Pacific Time
  'Europe/London',        // UK
  'Europe/Paris',         // Central Europe
  'Asia/Tokyo'            // Japan
];

/**
 * Format time with the user's timezone
 * @param {Date} date - Date object to format
 * @param {string} timezone - User's timezone
 * @returns {string} - Formatted time string
 */
function formatTimezone(date, timezone = 'UTC') {
  try {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      hour12: false
    });
  } catch (error) {
    console.error('Error formatting timezone:', error);
    // Fallback to simple format
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
}

/**
 * Parse a time range input from the user, with optional timezone
 * @param {string} timeRangeStr - Time range string (e.g., "now-8:30 EST", "6:00-9:30 PST")
 * @returns {Object} - Start and end times in server time
 */
function parseTimeRange(timeRangeStr) {
  if (!timeRangeStr || !timeRangeStr.includes('-')) {
    throw new Error('Invalid time range format. Please use format like "now-8:30", "6:00-9:30", or "now-1:04pm EST"');
  }

  // Extract time zone if present
  let timezone = 'UTC'; // Default timezone
  const timeZoneAbbreviations = {
    'EST': 'America/New_York',
    'EDT': 'America/New_York',
    'CST': 'America/Chicago',
    'CDT': 'America/Chicago',
    'MST': 'America/Denver',
    'MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PDT': 'America/Los_Angeles',
    'GMT': 'UTC',
    'UTC': 'UTC'
  };
  
  // Find any timezone identifiers
  let cleanedTimeRangeStr = timeRangeStr;
  for (const [abbr, tz] of Object.entries(timeZoneAbbreviations)) {
    if (timeRangeStr.toUpperCase().includes(abbr)) {
      timezone = tz;
      cleanedTimeRangeStr = timeRangeStr.replace(new RegExp(abbr, 'i'), '').trim();
      break;
    }
  }

  // Check for full timezone names (e.g., "America/New_York")
  const recognizedTimeZones = getRecognizedTimeZones();
  for (const tz of recognizedTimeZones) {
    if (timeRangeStr.includes(tz)) {
      timezone = tz;
      cleanedTimeRangeStr = timeRangeStr.replace(tz, '').trim();
      break;
    }
  }

  const [startStr, endStr] = cleanedTimeRangeStr.split('-').map(t => t.trim());
  const now = new Date();
  
  let startTime;
  if (startStr.toLowerCase() === 'now') {
    startTime = formatTime(now);
  } else {
    startTime = parseTimeString(startStr, now, timezone);
  }
  
  const endTime = parseTimeString(endStr, now, timezone);
  
  console.log(`Time range parsed: ${startTime} to ${endTime} (Timezone: ${timezone})`);
  
  return {
    start: startTime,
    end: endTime,
    timezone: timezone
  };
}

/**
 * Parse a time string into a formatted time, accounting for timezone
 * @param {string} timeStr - Time string (e.g., "8:30", "18:45", "9", "1:04pm")
 * @param {Date} referenceDate - Reference date to use
 * @param {string} timezone - User's timezone
 * @returns {string} - Formatted time in server time
 */
function parseTimeString(timeStr, referenceDate, timezone = 'UTC') {
  // Convert to lowercase for easier matching
  const lowerTimeStr = timeStr.toLowerCase();
  
  // Check for am/pm indicators
  const isAM = lowerTimeStr.includes('am');
  const isPM = lowerTimeStr.includes('pm');
  
  // Remove am/pm for parsing
  const cleanTimeStr = lowerTimeStr.replace(/(am|pm)/g, '').trim();
  
  // Match patterns like "8:30", "18:45", "9", etc.
  const timePattern = /^(\d{1,2})(?::(\d{1,2}))?$/;
  const match = cleanTimeStr.match(timePattern);
  
  if (!match) {
    throw new Error(`Invalid time format: "${timeStr}". Please use format like "8:30", "6pm", or "18:45"`);
  }
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  
  // Handle AM/PM if specified
  if (isPM && hours < 12) {
    hours += 12; // Convert to 24-hour format
  } else if (isAM && hours === 12) {
    hours = 0; // 12 AM is 0 in 24-hour format
  }
  
  // Validate hours and minutes
  if (hours < 0 || hours > 23) {
    throw new Error(`Invalid hour: ${hours}. Hours must be between 0 and 23`);
  }
  
  if (minutes < 0 || minutes > 59) {
    throw new Error(`Invalid minutes: ${minutes}. Minutes must be between 0 and 59`);
  }
  
  // Apply the timezone
  try {
    // Create a date string with the specified time
    const userDateTimeStr = `${referenceDate.toISOString().split('T')[0]}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    const userTimezoneDate = new Date(userDateTimeStr);
    
    // Adjust for timezone
    if (timezone !== 'UTC') {
      // Get the timezone offset for the user's timezone
      const userOffset = getUserTimezoneOffset(timezone);
      // Adjust the time for the offset
      userTimezoneDate.setMinutes(userTimezoneDate.getMinutes() + userOffset);
    }
    
    // SMART TIME HANDLING:
    // If no AM/PM was specified, we need to interpret the time intelligently
    if (!isAM && !isPM) {
      const currentHour = referenceDate.getHours();
      
      // Scenario 1: Current time is 13:00 (1 PM) and user enters "1:30"
      // We should interpret this as 13:30 (1:30 PM today) not 1:30 AM
      if (hours < 12 && currentHour >= 12 && Math.abs(hours + 12 - currentHour) < Math.abs(hours - currentHour)) {
        // If adding 12 to the hours gets us closer to the current hour, assume PM
        hours += 12;
        userTimezoneDate.setHours(hours);
      }
    }
    
    // If the calculated time is in the past and it's more than 1 hour earlier,
    // assume it's for the next day
    if (userTimezoneDate < referenceDate && (referenceDate - userTimezoneDate) > 60 * 60 * 1000) {
      userTimezoneDate.setDate(userTimezoneDate.getDate() + 1);
    }
    
    return formatTime(userTimezoneDate);
  } catch (error) {
    console.error(`Error processing timezone ${timezone}:`, error);
    
    // Fallback to basic time handling
    const date = new Date(referenceDate);
    date.setHours(hours, minutes, 0, 0);
    
    // If the calculated time is in the past and it's more than 1 hour earlier,
    // assume it's for the next day
    if (date < referenceDate && (referenceDate - date) > 60 * 60 * 1000) {
      date.setDate(date.getDate() + 1);
    }
    
    return formatTime(date);
  }
}

/**
 * Get the offset in minutes for a given timezone
 * @param {string} timezone - Timezone string
 * @returns {number} - Offset in minutes
 */
function getUserTimezoneOffset(timezone) {
  try {
    // Get current date
    const date = new Date();
    
    // Get offset in minutes between local time and UTC
    const localOffset = date.getTimezoneOffset();
    
    // Get the time in the specified timezone
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    // Calculate the difference in minutes
    const tzOffset = (tzDate - date) / 60000 + localOffset;
    
    return tzOffset;
  } catch (error) {
    console.error(`Error calculating timezone offset for ${timezone}:`, error);
    return 0; // Default to no offset on error
  }
}

/**
 * Format a Date object to a time string
 * @param {Date} date - Date to format
 * @returns {string} - Formatted time string (HH:MM)
 */
function formatTime(date) {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Get the current time formatted
 * @returns {string} - Current time in HH:MM format
 */
function getCurrentTime() {
  return formatTime(new Date());
}

/**
 * Get the current date and time with timezone info for display
 * @returns {string} - Formatted date and time with timezone
 */
function getCurrentDateTimeWithTZ() {
  const now = new Date();
  const offset = -now.getTimezoneOffset() / 60;
  const offsetString = offset >= 0 ? `+${offset}` : `${offset}`;
  
  return `${now.toLocaleDateString()} ${formatTime(now)} (UTC${offsetString})`;
}

/**
 * Check if a time has expired
 * @param {string} timeStr - Time string in HH:MM format
 * @param {Date} currentTime - Current time to compare against
 * @returns {boolean} - True if the time has expired, false otherwise
 */
function isTimeExpired(timeStr, currentTime = new Date()) {
  // Parse the end time
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create a date object for the end time (using today's date)
  const endTime = new Date(currentTime);
  endTime.setHours(hours, minutes, 0, 0);
  
  // If the time is less than 3 hours in either direction, 
  // treat it as a time for today
  const hourDiff = Math.abs(endTime - currentTime) / (1000 * 60 * 60);
  
  // For times in the recent past (within the last 3 hours), 
  // consider it already expired rather than assuming next day
  if (endTime < currentTime && hourDiff <= 3) {
    console.log(`Time ${timeStr} is in the past and within 3 hours, considering expired`);
    return true;
  }
  
  // If the end time is more than 3 hours in the past, 
  // it's probably meant for tomorrow
  if (endTime < currentTime && hourDiff > 3) {
    console.log(`Time ${timeStr} is more than 3 hours in the past, assuming next day`);
    endTime.setDate(endTime.getDate() + 1);
  }
  
  // For debugging, log the comparison
  console.log(`Comparing current time ${formatTime(currentTime)} with end time ${formatTime(endTime)}`);
  console.log(`Time expired? ${currentTime >= endTime}`);
  
  // Return true if current time is past or equal to the end time
  return currentTime >= endTime;
}

/**
 * Get a formatted list of time zones with their current times for UI display
 * @returns {string} - Formatted list of time zones
 */
function getTimeZonesList() {
  const now = new Date();
  const result = [];
  
  for (const zone of COMMON_TIMEZONES) {
    try {
      const zoneTime = now.toLocaleTimeString('en-US', {
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false,
        timeZone: zone
      });
      result.push(`${zone}: ${zoneTime}`);
    } catch (error) {
      console.error(`Error formatting time for zone ${zone}:`, error);
    }
  }
  
  return result.join('\n');
}

/**
 * Get a list of recognized time zones
 * @returns {Array} - Array of time zone strings
 */
function getRecognizedTimeZones() {
  return COMMON_TIMEZONES;
}

module.exports = {
  formatTimezone,
  parseTimeRange,
  getCurrentTime,
  isTimeExpired,
  formatTime,
  getCurrentDateTimeWithTZ,
  getTimeZonesList,
  getRecognizedTimeZones
};