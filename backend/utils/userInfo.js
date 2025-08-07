import { config } from "dotenv";
config();

import axios from "axios";

// Function to get client IP address
const getClientIP = (req) => {
  return req.headers['cf-connecting-ip'] ||
         req.headers['x-real-ip'] ||
         req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'unknown';
};

// Function to get country flag emoji
const getCountryFlagEmoji = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return '';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
};

// Function to format time in user-friendly format
const formatCurrentTime = (timezone) => {
  try {
    const now = new Date();
    if (timezone) {
      return now.toLocaleString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
    }
    return now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch (error) {
    return new Date().toISOString();
  }
};

export const getLoginDetails = async (req) => {
  const clientIP = getClientIP(req);
  
  let locationData = {
    ip: clientIP,
    continent: 'Unknown',
    country: 'Unknown',
    country_code: '',
    region: 'Unknown',
    city: 'Unknown',
    latitude: null,
    longitude: null,
    timezone: null,
    org: 'Unknown',
    isp: 'Unknown',
    flagEmoji: ''
  };

  // Try multiple IP geolocation services for better reliability
  const ipServices = [
    {
      name: 'ipwho.is',
      url: `http://ipwho.is/${clientIP}`,
      parseResponse: (data) => ({
        ip: data.ip,
        continent: data.continent,
        country: data.country,
        country_code: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone?.id,
        org: data.connection?.org || data.org,
        isp: data.connection?.isp || data.isp
      })
    },
    {
      name: 'ipapi.co',
      url: `https://ipapi.co/${clientIP}/json/`,
      parseResponse: (data) => ({
        ip: data.ip,
        continent: data.continent_code,
        country: data.country_name,
        country_code: data.country_code,
        region: data.region,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
        timezone: data.timezone,
        org: data.org,
        isp: data.org
      })
    }
  ];

  // Try each service until one succeeds
  for (const service of ipServices) {
    try {
      console.log(`Trying to get location from ${service.name} for IP: ${clientIP}`);
      
      const { data } = await axios.get(service.url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; E-commerce-App/1.0)'
        }
      });

      // Check if the response is valid
      if (data && (data.success !== false) && data.ip) {
        const parsedData = service.parseResponse(data);
        locationData = {
          ...locationData,
          ...parsedData
        };
        
        // Add flag emoji
        if (parsedData.country_code) {
          locationData.flagEmoji = getCountryFlagEmoji(parsedData.country_code);
        }
        
        console.log(`Successfully got location data from ${service.name}`);
        break;
      }
    } catch (err) {
      console.error(`Error fetching from ${service.name}:`, err.message);
      continue;
    }
  }

  // Get user agent information
  const userAgent = req.headers['user-agent'] || '';
  let browserInfo = 'Unknown Browser';
  let osInfo = 'Unknown OS';

  try {
    // Simple browser detection
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browserInfo = 'Chrome';
    } else if (userAgent.includes('Firefox')) {
      browserInfo = 'Firefox';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserInfo = 'Safari';
    } else if (userAgent.includes('Edg')) {
      browserInfo = 'Edge';
    }

    // Simple OS detection
    if (userAgent.includes('Windows')) {
      osInfo = 'Windows';
    } else if (userAgent.includes('Mac OS X')) {
      osInfo = 'macOS';
    } else if (userAgent.includes('Linux')) {
      osInfo = 'Linux';
    } else if (userAgent.includes('Android')) {
      osInfo = 'Android';
    } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      osInfo = 'iOS';
    }
  } catch (error) {
    console.error('Error parsing user agent:', error);
  }

  // Format current time
  const formattedTime = formatCurrentTime(locationData.timezone);

  return {
    ...locationData,
    currentTime: formattedTime,
    time: new Date().toLocaleString(),
    browser: browserInfo,
    os: osInfo,
    userAgent: userAgent,
    timestamp: new Date().toISOString(),
    // Add additional security info
    requestHeaders: {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer
    }
  };
};

// Function to detect suspicious login activity
export const detectSuspiciousActivity = (loginHistory, currentLogin) => {
  const suspiciousFactors = [];

  if (!loginHistory || loginHistory.length === 0) {
    return { isSuspicious: false, factors: [] };
  }

  const recentLogins = loginHistory.slice(-10); // Last 10 logins
  
  // Check for different countries
  const countries = recentLogins.map(login => login.country).filter(Boolean);
  const uniqueCountries = [...new Set(countries)];
  
  if (uniqueCountries.length > 1 && !countries.includes(currentLogin.country)) {
    suspiciousFactors.push('New country login');
  }

  // Check for different cities in short time
  const recentCities = recentLogins
    .filter(login => login.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
    .map(login => login.city)
    .filter(Boolean);
  
  const uniqueCities = [...new Set(recentCities)];
  if (uniqueCities.length > 2 && !recentCities.includes(currentLogin.city)) {
    suspiciousFactors.push('Multiple cities in 24 hours');
  }

  // Check for unusual time patterns
  const lastLogin = recentLogins[recentLogins.length - 1];
  if (lastLogin && lastLogin.createdAt) {
    const timeDiff = new Date() - new Date(lastLogin.createdAt);
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff < 2 && Math.abs(currentLogin.longitude - (lastLogin.longitude || 0)) > 30) {
      suspiciousFactors.push('Geographically impossible travel time');
    }
  }

  return {
    isSuspicious: suspiciousFactors.length > 0,
    factors: suspiciousFactors,
    riskScore: Math.min(suspiciousFactors.length * 25, 100) // 0-100 scale
  };
};