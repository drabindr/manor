# Bhyve Flowers Preset Feature

## Overview

The **Flowers Preset** is a new automated watering sequence that runs the front flower bed for 1 minute, followed by the backyard for 1 minute. This feature includes backend scheduling, real-time status updates, and automatic queue management even when the app is closed.

## 🌸 Features

- **Preset Button**: One-click "Flowers" preset in the Bhyve irrigation widget
- **Sequential Watering**: Automatically runs Front Flower Bed → Backyard
- **Smart Zone Detection**: Fuzzy matching to find appropriate zones by name
- **Backend Scheduling**: Uses DynamoDB to persist schedules even when app is closed
- **Real-time Updates**: WebSocket integration for live status updates across all users
- **Cancellation Support**: Can cancel active presets at any time
- **Visual Feedback**: Button changes to show preset status (running/available)

## 🏗️ Architecture

### Backend Components

1. **Watering Scheduler** (`/lambda/casa-integrations/scheduler/wateringScheduler.ts`)
   - Manages sequential watering tasks
   - Stores schedules in DynamoDB with TTL for auto-cleanup
   - Handles preset execution and chaining

2. **DynamoDB Table** (`BhyveWateringSchedule`)
   - Stores watering tasks with status tracking
   - Global Secondary Indexes for efficient querying
   - Auto-cleanup completed tasks after 24 hours

3. **API Endpoints**
   - `POST /bhyve/presets/flowers` - Start Flowers preset
   - `POST /bhyve/presets/cancel` - Cancel active presets
   - `POST /bhyve/presets/status` - Get active preset status

### Frontend Components

1. **Preset Button** (in `BhyveIrrigation.tsx`)
   - Dynamic button that shows current state
   - Changes appearance when preset is active
   - Provides visual feedback during execution

2. **Status Tracking**
   - Real-time polling for active presets
   - Integration with existing watering status system
   - Automatic UI updates

## 🚀 Implementation Details

### Zone Detection Logic

The system uses fuzzy matching to find appropriate zones:

```typescript
// Front Flower Bed detection
if (lowerTarget.includes('front') && lowerTarget.includes('flower')) {
  zone = zones.find(z => {
    const lowerName = z.name.toLowerCase();
    return lowerName.includes('front') && (lowerName.includes('flower') || lowerName.includes('bed'));
  });
}

// Backyard detection
if (lowerTarget.includes('back')) {
  zone = zones.find(z => {
    const lowerName = z.name.toLowerCase();
    return lowerName.includes('back') && (lowerName.includes('yard') || lowerName.includes('lawn'));
  });
}
```

### Task Sequencing

1. **Task Creation**: Creates ordered tasks with timing
2. **Sequential Execution**: Each task triggers the next after completion
3. **Error Handling**: Failed tasks don't prevent subsequent tasks
4. **Status Broadcasting**: Real-time updates to all connected clients

### Data Persistence

Tasks are stored in DynamoDB with the following structure:

```typescript
interface WateringTask {
  id: string;
  deviceId: string;
  station: number;
  duration: number; // minutes
  scheduledTime: number; // timestamp
  status: 'pending' | 'running' | 'completed' | 'failed';
  presetName?: string;
  sequence: number;
  createdAt: number;
  updatedAt: number;
}
```

## 📱 User Experience

### Starting a Preset

1. User clicks "Flowers Preset" button
2. Backend creates sequential tasks
3. First task (Front Flower Bed) starts immediately
4. Button shows "Cancel Flowers" with different styling
5. Real-time status updates across all user devices

### Preset Execution

1. **Front Flower Bed**: Runs for 1 minute
2. **Buffer Time**: 5-second pause between tasks
3. **Backyard**: Runs for 1 minute
4. **Completion**: Button returns to normal state

### Visual Feedback

- **Available**: Pink/purple gradient with 🌸 icon
- **Running**: Orange/red gradient with ⏹️ icon
- **Loading**: Spinner animation during API calls

## 🧪 Testing

### Manual Testing

Use the included test script:

```bash
./test-flowers-preset.sh
```

### API Testing

Test individual endpoints:

```bash
# Start Flowers preset
curl -X POST "https://your-api.com/prod/bhyve/presets/flowers" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "your-device-id"}'

# Check status
curl -X POST "https://your-api.com/prod/bhyve/presets/status" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "your-device-id"}'

# Cancel presets
curl -X POST "https://your-api.com/prod/bhyve/presets/cancel" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "your-device-id"}'
```

### Frontend Testing

1. Open Bhyve irrigation widget
2. Click "Flowers Preset" button
3. Verify button changes to "Cancel Flowers"
4. Watch real-time status updates
5. Test cancellation functionality

## 🛠️ Configuration

### Adding New Presets

To add new presets, update the `PRESETS` object in `wateringScheduler.ts`:

```typescript
const PRESETS: Record<string, WateringPreset> = {
  'Flowers': {
    name: 'Flowers',
    tasks: [
      { stationName: 'Front Flower Bed', duration: 1, sequence: 1 },
      { stationName: 'Backyard', duration: 1, sequence: 2 }
    ]
  },
  'FullYard': {
    name: 'FullYard',
    tasks: [
      { stationName: 'Front Yard', duration: 15, sequence: 1 },
      { stationName: 'Backyard', duration: 20, sequence: 2 },
      { stationName: 'Side Yard', duration: 10, sequence: 3 }
    ]
  }
};
```

### Customizing Durations

The default Flowers preset runs each zone for 1 minute. To modify:

1. Update the `PRESETS` configuration
2. Or add duration parameters to the API endpoint
3. Frontend can be updated to allow user-configurable durations

## 🔧 Deployment

### Infrastructure

The feature requires:

1. **DynamoDB Table**: `BhyveWateringSchedule` with GSIs
2. **Lambda Function**: Updated integration handler with scheduler
3. **API Gateway**: New preset endpoints

### CDK Deployment

```bash
cd packages/cdk
npm run build
cdk deploy CasaIntegrationsCdkStack
```

### Environment Variables

Required environment variables for Lambda:

- `WATERING_SCHEDULE_TABLE_NAME`: DynamoDB table name
- `AWS_REGION`: AWS region for DynamoDB

## 🐛 Troubleshooting

### Common Issues

1. **Zone Not Found**: Check zone names in Bhyve app match fuzzy matching logic
2. **Preset Not Starting**: Verify device ID and check CloudWatch logs
3. **Status Not Updating**: Check DynamoDB table permissions
4. **Button Not Changing**: Verify frontend preset status polling

### Debugging

1. **Backend Logs**: Check CloudWatch logs for integration Lambda
2. **DynamoDB**: Query `BhyveWateringSchedule` table directly
3. **Frontend**: Use browser console for API call debugging
4. **Bhyve API**: Verify Bhyve credentials and device connectivity

### Error Messages

- `Zone not found for "X"`: Zone name doesn't match any device zones
- `Device X not found`: Invalid device ID provided
- `Max retries exceeded`: Bhyve API connectivity issues

## 🔮 Future Enhancements

1. **Custom Presets**: User-defined presets with configurable zones and durations
2. **Scheduling**: Time-based preset scheduling (e.g., daily at 6 AM)
3. **Weather Integration**: Skip presets based on recent rainfall
4. **Smart Durations**: AI-suggested durations based on season/weather
5. **Multi-Device**: Presets that span multiple irrigation controllers
6. **Voice Control**: Integration with smart speakers
7. **Advanced Sequencing**: Conditional logic (e.g., only water if soil moisture low)

## 📚 Related Documentation

- [Bhyve Integration Guide](./BHYVE_INTEGRATION.md)
- [WebSocket API Documentation](./WEBSOCKET_API.md)
- [DynamoDB Schema](./DATABASE_SCHEMA.md)
- [CDK Stack Documentation](./CDK_STACKS.md)

---

**Note**: This feature enhances the existing Bhyve integration with minimal disruption to current functionality. All existing manual watering controls continue to work unchanged.
