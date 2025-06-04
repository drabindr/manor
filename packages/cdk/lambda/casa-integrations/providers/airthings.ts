import axios from 'axios';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

async function getParameter(name: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: true,
  });
  const response = await ssmClient.send(command);
  if (!response.Parameter?.Value) {
    throw new Error(`Parameter ${name} not found or empty`);
  }
  return response.Parameter.Value;
}

async function getAccessToken(): Promise<string> {
  const clientId = await getParameter('/airthings/client-id');
  const clientSecret = await getParameter('/airthings/client-secret');

  const tokenUrl = 'https://accounts-api.airthings.com/v1/token';
  const formData = new URLSearchParams();
  formData.append('grant_type', 'client_credentials');
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);
  formData.append('scope', 'read:device:current_values');
  const response = await axios.post(tokenUrl, formData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  });
  if (!response.data.access_token) {
    throw new Error('No access token in response');
  }
  return response.data.access_token;
}

/**
 * Updated thresholds based on industry standards for indoor air quality
 */
const THRESHOLDS = {
  radon: {
    good: 0,
    fair: 100,  // WHO recommends below 100 Bq/m³
    poor: 200   // Significantly concerning above 200 Bq/m³
  },
  co2: {
    good: 0,
    fair: 800,  // Normal levels for indoor spaces
    poor: 1000  // Above 1000 ppm may cause discomfort
  },
  voc: {
    good: 0,
    fair: 250,  // Low VOC levels 
    poor: 2000  // High VOC levels
  },
  temp: {
    good: 18,
    fair: 24,   // Comfortable range 18-24°C
    poor: 26    // Uncomfortably warm above 26°C
  },
  humidity: {
    good: 30,
    fair: 60,   // Ideal indoor humidity 30-60%
    poor: 65    // Too humid above 65%
  },
  pm2_5: {
    good: 0,
    fair: 5,    // WHO guidelines: below 5 µg/m³ is good
    poor: 10    // Above 10 µg/m³ is poor
  },
  pm1: {
    good: 0,
    fair: 10,   // More stringent than PM2.5
    poor: 20
  },
  pressure: {
    good: 990,
    fair: 1010, // Normal atmospheric pressure range
    poor: 1020  // Notable pressure changes
  }
};

function assessMetric(value: number, thresholds: typeof THRESHOLDS[keyof typeof THRESHOLDS]): 'good' | 'fair' | 'poor' {
  // For humidity, the assessment logic is different - good is BETWEEN fair and poor
  if (thresholds === THRESHOLDS.humidity) {
    if (value >= thresholds.good && value <= thresholds.fair) return 'good';
    if (value < thresholds.good || value <= thresholds.poor) return 'fair';
    return 'poor';
  }
  
  // For most metrics, lower values are better
  if (value <= thresholds.fair) return 'good';
  if (value <= thresholds.poor) return 'fair';
  return 'poor';
}

/**
 * Given an array of historical samples, aggregate the data by averaging.
 * Assumes each sample is an object with keys: radon, pm25/pm2_5, co2, voc, humidity, pm1, temp, pressure.
 */
function aggregateSamples(samples: any[]): any {
  const aggregated: any = {};
  // Use keys that might be returned; note that for PM2.5 we handle both keys.
  const keys = ['radon', 'pm25', 'co2', 'voc', 'humidity', 'pm1', 'temp', 'pressure'];
  keys.forEach(key => {
    const total = samples.reduce((sum, sample) => {
      let val = sample[key];
      if (key === 'pm25') {
        // In case the response uses "pm2_5" instead
        val = sample['pm2_5'] ?? val;
      }
      return sum + (val || 0);
    }, 0);
    aggregated[key] = total / samples.length;
  });
  return aggregated;
}

/**
 * Get the latest sensor data from Airthings
 */
export async function getSensorData(): Promise<any> {
  try {
    console.log('Getting Airthings access token...');
    const accessToken = await getAccessToken();
    
    console.log('Getting device ID...');
    const deviceId = await getParameter('/airthings/device-id');
    
    console.log(`Fetching latest data for device ${deviceId}...`);
    const response = await axios.get(
      `https://ext-api.airthings.com/v1/devices/${deviceId}/latest-samples`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.data?.data) {
      console.error('Unexpected API response:', response.data);
      throw new Error('Invalid API response format');
    }
    
    const resultData = response.data.data;

    // Format the output to match the expected structure
    const result = {
      radon: {
        value: resultData.radonShortTermAvg || resultData.radon || resultData.radon_short_term_avg,
        unit: 'Bq/m³',
        assessment: 'unknown'
      },
      pm2_5: {
        value: resultData.pm25 || resultData.pm2_5 || resultData['pm2.5'],
        unit: 'µg/m³',
        assessment: 'unknown'
      },
      co2: {
        value: resultData.co2,
        unit: 'ppm',
        assessment: 'unknown'
      },
      voc: {
        value: resultData.voc,
        unit: 'ppb',
        assessment: 'unknown'
      },
      humidity: {
        value: resultData.humidity,
        unit: '%',
        assessment: 'unknown'
      },
      pm1: {
        value: resultData.pm1,
        unit: 'µg/m³',
        assessment: 'unknown'
      },
      temperature: {
        value: resultData.temp,
        unit: '°C',
        assessment: 'unknown'
      },
      pressure: {
        value: resultData.pressure,
        unit: 'hPa',
        assessment: 'unknown'
      }
    };

    // Apply assessments for each metric using thresholds
    if (result.radon.value !== undefined) {
      result.radon.assessment = assessMetric(result.radon.value, THRESHOLDS.radon);
    }
    if (result.pm2_5.value !== undefined) {
      result.pm2_5.assessment = assessMetric(result.pm2_5.value, THRESHOLDS.pm2_5);
    }
    if (result.co2.value !== undefined) {
      result.co2.assessment = assessMetric(result.co2.value, THRESHOLDS.co2);
    }
    if (result.voc.value !== undefined) {
      result.voc.assessment = assessMetric(result.voc.value, THRESHOLDS.voc);
    }
    if (result.humidity.value !== undefined) {
      result.humidity.assessment = assessMetric(result.humidity.value, THRESHOLDS.humidity);
    }
    if (result.pm1.value !== undefined) {
      result.pm1.assessment = assessMetric(result.pm1.value, THRESHOLDS.pm1);
    }
    if (result.temperature.value !== undefined) {
      result.temperature.assessment = assessMetric(result.temperature.value, THRESHOLDS.temp);
    }
    if (result.pressure.value !== undefined) {
      result.pressure.assessment = assessMetric(result.pressure.value, THRESHOLDS.pressure);
    }

    return result;
  } catch (error: any) {
    console.error('Error in getSensorData:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    throw new Error(`Failed to fetch sensor data: ${error.response?.data?.error || error.message}`);
  }
}
