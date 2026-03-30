import { supabase } from "./supabase";

export interface WeatherData {
  condition_main: string;
  condition_description: string;
  temp_min: number;
  temp_max: number;
  temp_current: number;
  rain_mm: number;
  rain_probability: number;
  wind_speed: number;
  wind_direction: number;
  humidity: number;
  pressure: number;
  visibility: number;
  uv_index?: number;
  is_forecast: boolean;
  raw_json?: any;
}

export interface WeatherForecast {
  current: WeatherData;
  forecast: WeatherData[]; // 7-day forecast
  location: {
    lat: number;
    lng: number;
    timezone: string;
  };
}

export interface ProjectLocation {
  lat: number;
  lng: number;
  timezone: string;
  address?: string;
}

// OpenWeatherMap API configuration
const OPENWEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY || '';
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Debug logging for API key
console.log('🌤️ Weather API:', { hasApiKey: !!OPENWEATHER_API_KEY, apiKeyLength: OPENWEATHER_API_KEY.length });

if (!OPENWEATHER_API_KEY) {
  console.warn('🌤️ OpenWeatherMap API key not configured. Set VITE_OPENWEATHER_API_KEY environment variable.');
}

/**
 * Get project location from database
 */
export async function getProjectLocation(projectId: string): Promise<ProjectLocation | null> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('site_lat, site_lng, site_timezone, site_address')
      .eq('id', projectId)
      .single();

    if (error || !data) {
      console.error('Failed to fetch project location:', error);
      return null;
    }

    // Check if location is set
    if (!data.site_lat || !data.site_lng) {
      return null;
    }

    return {
      lat: data.site_lat,
      lng: data.site_lng,
      timezone: data.site_timezone || 'UTC',
      address: data.site_address || undefined
    };
  } catch (error) {
    console.error('Exception fetching project location:', error);
    return null;
  }
}

/**
 * Update project location
 */
export async function updateProjectLocation(
  projectId: string,
  location: Partial<ProjectLocation>
): Promise<boolean> {
  try {
    const updateData: any = {};
    
    if (location.lat !== undefined) updateData.site_lat = location.lat;
    if (location.lng !== undefined) updateData.site_lng = location.lng;
    if (location.timezone !== undefined) updateData.site_timezone = location.timezone;

    const { error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId);

    if (error) {
      console.error('Failed to update project location:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception updating project location:', error);
    return false;
  }
}

/**
 * Get current weather for a location
 */
export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherData | null> {
  if (!OPENWEATHER_API_KEY) {
    console.warn('🌤️ OpenWeatherMap API key not configured');
    return null;
  }

  const endpoint = `${OPENWEATHER_BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=metric`;
  
  console.log('🌤️ getCurrentWeather Debug:', {
    lat,
    lng,
    endpoint: endpoint.replace(/appid=[^&]+/, 'appid=***')
  });

  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      condition_main: data.weather[0].main,
      condition_description: data.weather[0].description,
      temp_min: data.main.temp_min,
      temp_max: data.main.temp_max,
      temp_current: data.main.temp,
      rain_mm: data.rain?.['1h'] || data.rain?.['3h'] || 0,
      rain_probability: 0, // Current weather doesn't include probability
      wind_speed: data.wind?.speed || 0,
      wind_direction: data.wind?.deg || 0,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      visibility: data.visibility || 10000,
      uv_index: data.uvi,
      is_forecast: false,
      raw_json: data
    };
  } catch (error) {
    console.error('Failed to fetch current weather:', error);
    return null;
  }
}

/**
 * Get 7-day weather forecast for a location
 */
export async function getWeatherForecast(lat: number, lng: number): Promise<WeatherData[]> {
  if (!OPENWEATHER_API_KEY) {
    console.warn('🌤️ OpenWeatherMap API key not configured');
    return [];
  }

  const endpoint = `${OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=metric&cnt=56`;
  
  console.log('🌤️ getWeatherForecast Debug:', {
    lat,
    lng,
    endpoint: endpoint.replace(/appid=[^&]+/, 'appid=***')
  });

  try {
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Group forecasts by day and take midday forecast for each day
    const dailyForecasts: { [key: string]: any[] } = {};
    
    data.list.forEach((forecast: any) => {
      const date = new Date(forecast.dt * 1000).toISOString().split('T')[0];
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = [];
      }
      dailyForecasts[date].push(forecast);
    });

    // Get the forecast closest to noon for each day
    const forecasts: WeatherData[] = [];
    Object.keys(dailyForecasts).forEach(date => {
      const dayForecasts = dailyForecasts[date];
      const noonForecast = dayForecasts.reduce((closest, forecast) => {
        const hour = new Date(forecast.dt * 1000).getHours();
        const closestHour = new Date(closest.dt * 1000).getHours();
        return Math.abs(hour - 12) < Math.abs(closestHour - 12) ? forecast : closest;
      });

      const forecast = noonForecast;
      forecasts.push({
        condition_main: forecast.weather[0].main,
        condition_description: forecast.weather[0].description,
        temp_min: forecast.main.temp_min,
        temp_max: forecast.main.temp_max,
        temp_current: forecast.main.temp,
        rain_mm: forecast.rain?.['3h'] || 0,
        rain_probability: forecast.pop || 0,
        wind_speed: forecast.wind?.speed || 0,
        wind_direction: forecast.wind?.deg || 0,
        humidity: forecast.main.humidity,
        pressure: forecast.main.pressure,
        visibility: forecast.visibility || 10000,
        uv_index: forecast.uvi,
        is_forecast: true,
        raw_json: forecast
      });
    });

    return forecasts.slice(0, 7); // Return exactly 7 days
  } catch (error) {
    console.error('Failed to fetch weather forecast:', error);
    return [];
  }
}

/**
 * Get complete weather data for a project (current + 7-day forecast)
 */
export async function getProjectWeather(projectId: string): Promise<WeatherForecast | null> {
  try {
    const location = await getProjectLocation(projectId);
    if (!location) {
      return null;
    }

    const [current, forecast] = await Promise.all([
      getCurrentWeather(location.lat, location.lng),
      getWeatherForecast(location.lat, location.lng)
    ]);

    if (!current) {
      return null;
    }

    return {
      current,
      forecast,
      location
    };
  } catch (error) {
    console.error('Failed to get project weather:', error);
    return null;
  }
}

/**
 * Get weather for a specific date (from forecast or historical)
 */
export async function getWeatherForDate(
  projectId: string, 
  date: string
): Promise<WeatherData | null> {
  try {
    const location = await getProjectLocation(projectId);
    if (!location) {
      return null;
    }

    // Check if date is in the past or today
    const targetDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    if (targetDate >= today) {
      // Get from forecast
      const forecasts = await getWeatherForecast(location.lat, location.lng);
      const targetForecast = forecasts.find(f => {
        const forecastDate = new Date();
        forecastDate.setDate(forecastDate.getDate() + forecasts.indexOf(f));
        forecastDate.setHours(0, 0, 0, 0);
        return forecastDate.getTime() === targetDate.getTime();
      });
      return targetForecast || null;
    } else {
      // For historical dates, we would need a different API or stored data
      // For now, return null and let daily logs handle historical data
      return null;
    }
  } catch (error) {
    console.error('Failed to get weather for date:', error);
    return null;
  }
}

/**
 * Auto-fill weather data for daily log
 */
export async function autoFillWeatherForLog(
  projectId: string,
  logDate: string
): Promise<{
  weather_condition?: string;
  weather_temp?: number;
  weather_rain_mm?: number;
  weather_wind_speed?: number;
  weather_humidity?: number;
  weather_snapshot_json?: any;
} | null> {
  try {
    const weather = await getWeatherForDate(projectId, logDate);
    if (!weather) {
      return null;
    }

    return {
      weather_condition: weather.condition_description,
      weather_temp: weather.temp_current,
      weather_rain_mm: weather.rain_mm,
      weather_wind_speed: weather.wind_speed,
      weather_humidity: weather.humidity,
      weather_snapshot_json: weather.raw_json
    };
  } catch (error) {
    console.error('Failed to auto-fill weather for log:', error);
    return null;
  }
}

/**
 * Check if conditions are suitable for outdoor work
 */
export function getWorkSuitability(weather: WeatherData): {
  suitable: boolean;
  risk: 'low' | 'medium' | 'high';
  reasons: string[];
} {
  const reasons: string[] = [];
  let risk: 'low' | 'medium' | 'high' = 'low';

  // Check rain
  if (weather.rain_mm > 5) {
    reasons.push(`Heavy rain: ${weather.rain_mm}mm`);
    risk = 'high';
  } else if (weather.rain_mm > 1 || weather.rain_probability > 60) {
    reasons.push(`Light rain or high chance of rain: ${weather.rain_probability}%`);
    risk = 'medium';
  }

  // Check wind
  if (weather.wind_speed > 40) {
    reasons.push(`High wind: ${weather.wind_speed} km/h`);
    risk = 'high';
  } else if (weather.wind_speed > 25) {
    reasons.push(`Moderate wind: ${weather.wind_speed} km/h`);
    risk = 'medium';
  }

  // Check temperature
  if (weather.temp_current < 0 || weather.temp_current > 35) {
    reasons.push(`Extreme temperature: ${weather.temp_current}°C`);
    risk = 'high';
  } else if (weather.temp_current < 5 || weather.temp_current > 30) {
    reasons.push(`Challenging temperature: ${weather.temp_current}°C`);
    risk = 'medium';
  }

  // Check visibility
  if (weather.visibility < 1000) {
    reasons.push(`Poor visibility: ${weather.visibility}m`);
    risk = 'high';
  }

  return {
    suitable: risk === 'low',
    risk,
    reasons
  };
}
