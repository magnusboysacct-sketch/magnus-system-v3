import React from 'react';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye, Gauge, AlertTriangle } from 'lucide-react';
import type { WeatherData } from '../lib/weather';
import { getWorkSuitability } from '../lib/weather';
import { theme } from '../lib/theme';

interface WeatherCardProps {
  weather: WeatherData;
  title?: string;
  showForecast?: boolean;
  compact?: boolean;
}

export function WeatherCard({ weather, title = "Current Weather", showForecast = false, compact = false }: WeatherCardProps) {
  const suitability = getWorkSuitability(weather);
  
  const getWeatherIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'clear':
      case 'sunny':
        return <Sun className="w-5 h-5 text-yellow-500" />;
      case 'clouds':
      case 'cloudy':
        return <Cloud className="w-5 h-5 text-gray-500" />;
      case 'rain':
      case 'drizzle':
        return <CloudRain className="w-5 h-5 text-blue-500" />;
      default:
        return <Cloud className="w-5 h-5 text-gray-400" />;
    }
  };

  const getRiskColor = (risk: 'low' | 'medium' | 'high') => {
    switch (risk) {
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
    }
  };

  if (compact) {
    return (
      <div className={`rounded-xl border ${theme.border.base} ${theme.surface.base} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getWeatherIcon(weather.condition_main)}
            <div>
              <p className={`text-sm font-medium ${theme.text.primary}`}>
                {weather.condition_description}
              </p>
              <p className={`text-xs ${theme.text.muted}`}>
                {Math.round(weather.temp_current)}°C
              </p>
            </div>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-medium border ${getRiskColor(suitability.risk)}`}>
            {suitability.risk.toUpperCase()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${theme.border.base} ${theme.surface.base} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${theme.text.primary}`}>{title}</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(suitability.risk)}`}>
          {suitability.suitable ? 'Suitable' : 'Challenging'} for Work
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center gap-3">
          {getWeatherIcon(weather.condition_main)}
          <div>
            <p className={`text-sm font-medium ${theme.text.primary}`}>
              {weather.condition_description}
            </p>
            <p className={`text-xs ${theme.text.muted}`}>
              {Math.round(weather.temp_current)}°C (feels like {Math.round(weather.temp_min)}°-{Math.round(weather.temp_max)}°)
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-blue-500" />
            <span className={`text-sm ${theme.text.secondary}`}>
              Rain: {weather.rain_mm}mm
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-gray-500" />
            <span className={`text-sm ${theme.text.secondary}`}>
              Wind: {weather.wind_speed} km/h
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-xs">
        <div className="flex items-center gap-1">
          <Droplets className="w-3 h-3 text-blue-500" />
          <span className={theme.text.muted}>Humidity</span>
          <span className={`font-medium ${theme.text.primary}`}>{weather.humidity}%</span>
        </div>
        <div className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-gray-500" />
          <span className={theme.text.muted}>Pressure</span>
          <span className={`font-medium ${theme.text.primary}`}>{weather.pressure} hPa</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="w-3 h-3 text-gray-500" />
          <span className={theme.text.muted}>Visibility</span>
          <span className={`font-medium ${theme.text.primary}`}>{weather.visibility}m</span>
        </div>
        <div className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-yellow-500" />
          <span className={theme.text.muted}>Rain Chance</span>
          <span className={`font-medium ${theme.text.primary}`}>{Math.round(weather.rain_probability * 100)}%</span>
        </div>
      </div>

      {!suitability.suitable && suitability.reasons.length > 0 && (
        <div className={`mt-4 p-3 rounded-lg ${theme.status.warning.bg} border ${theme.status.warning.border}`}>
          <p className={`text-xs font-medium ${theme.status.warning.text} mb-1`}>
            Work Conditions:
          </p>
          <ul className="text-xs space-y-1">
            {suitability.reasons.map((reason, index) => (
              <li key={index} className={theme.status.warning.text}>• {reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface WeatherForecastCardProps {
  forecast: WeatherData[];
  title?: string;
}

export function WeatherForecastCard({ forecast, title = "7-Day Forecast" }: WeatherForecastCardProps) {
  const getWeatherIcon = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'clear':
      case 'sunny':
        return <Sun className="w-4 h-4 text-yellow-500" />;
      case 'clouds':
      case 'cloudy':
        return <Cloud className="w-4 h-4 text-gray-500" />;
      case 'rain':
      case 'drizzle':
        return <CloudRain className="w-4 h-4 text-blue-500" />;
      default:
        return <Cloud className="w-4 h-4 text-gray-400" />;
    }
  };

  const getDayName = (index: number) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();
    const targetDay = (today + index) % 7;
    return days[targetDay];
  };

  return (
    <div className={`rounded-xl border ${theme.border.base} ${theme.surface.base} p-6`}>
      <h3 className={`text-lg font-semibold ${theme.text.primary} mb-4`}>{title}</h3>
      
      <div className="space-y-2">
        {forecast.map((day, index) => {
          const suitability = getWorkSuitability(day);
          const riskColor = suitability.risk === 'low' ? 'text-green-600' : 
                           suitability.risk === 'medium' ? 'text-yellow-600' : 'text-red-600';

          return (
            <div 
              key={index}
              className={`flex items-center justify-between p-3 rounded-lg border ${theme.border.base} ${theme.surface.muted}`}
            >
              <div className="flex items-center gap-3">
                <div className={`text-sm font-medium ${theme.text.primary} w-12`}>
                  {index === 0 ? 'Today' : getDayName(index)}
                </div>
                {getWeatherIcon(day.condition_main)}
                <div>
                  <p className={`text-sm ${theme.text.primary}`}>
                    {day.condition_description}
                  </p>
                  <p className={`text-xs ${theme.text.muted}`}>
                    {Math.round(day.temp_min)}°-{Math.round(day.temp_max)}°C
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-blue-500" />
                  <span className={theme.text.muted}>{day.rain_mm}mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <Wind className="w-3 h-3 text-gray-500" />
                  <span className={theme.text.muted}>{day.wind_speed}km/h</span>
                </div>
                <div className={`font-medium ${riskColor}`}>
                  {suitability.risk.toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
