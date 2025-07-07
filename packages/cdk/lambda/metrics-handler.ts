import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface MetricData {
  metricName: string;
  value: number;
  unit: string;
  timestamp: number;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

interface MetricsPayload {
  metrics: MetricData[];
  timestamp: number;
  source: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Metrics handler invoked:', JSON.stringify(event, null, 2));

  // Enable CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle OPTIONS requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Request body is required' })
      };
    }

    const payload: MetricsPayload = JSON.parse(event.body);
    
    if (!payload.metrics || !Array.isArray(payload.metrics)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Metrics array is required' })
      };
    }

    console.log(`Processing ${payload.metrics.length} metrics from ${payload.source}`);

    // Process metrics in batches (CloudWatch has a limit of 20 metrics per request)
    const batchSize = 20;
    const batches = [];
    
    for (let i = 0; i < payload.metrics.length; i += batchSize) {
      batches.push(payload.metrics.slice(i, i + batchSize));
    }

    const results = await Promise.allSettled(
      batches.map(batch => sendMetricsBatch(batch))
    );

    // Count successful vs failed batches
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`${failed} out of ${batches.length} metric batches failed`);
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Batch ${index} failed:`, result.reason);
        }
      });
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        processed: payload.metrics.length,
        batches: batches.length,
        successful: successful,
        failed: failed
      })
    };

  } catch (error) {
    console.error('Error processing metrics:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

async function sendMetricsBatch(metrics: MetricData[]): Promise<void> {
  const metricData = metrics.map(metric => {
    const dimensions = metric.dimensions ? 
      Object.entries(metric.dimensions).map(([name, value]) => ({
        Name: name,
        Value: value
      })) : [];

    return {
      MetricName: metric.metricName,
      Value: metric.value,
      Unit: metric.unit as any, // CloudWatch units
      Timestamp: new Date(metric.timestamp),
      Dimensions: dimensions
    };
  });

  const command = new PutMetricDataCommand({
    Namespace: 'ManorApp/Performance',
    MetricData: metricData
  });

  await cloudwatchClient.send(command);
  console.log(`Successfully sent batch of ${metrics.length} metrics to CloudWatch`);
}
