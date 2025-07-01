// wateringScheduler.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import * as bhyve from '../providers/bhyve';

const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDBClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const scheduleTableName = process.env.WATERING_SCHEDULE_TABLE_NAME || 'BhyveWateringSchedule';

interface WateringTask {
  id: string;
  deviceId: string;
  station: number;
  duration: number; // minutes
  scheduledTime: number; // timestamp
  status: 'pending' | 'running' | 'completed' | 'failed';
  presetName?: string;
  sequence: number; // for ordering tasks in a preset
  createdAt: number;
  updatedAt: number;
}

interface WateringPreset {
  name: string;
  tasks: Array<{
    stationName: string; // e.g., "Front Flower Bed", "Backyard"
    duration: number;
    sequence: number;
  }>;
}

// Pre-defined presets
const PRESETS: Record<string, WateringPreset> = {
  'Flowers': {
    name: 'Flowers',
    tasks: [
      { stationName: 'Front Flower Bed', duration: 1, sequence: 1 },
      { stationName: 'Backyard', duration: 1, sequence: 2 }
    ]
  }
};

/**
 * Create a watering preset schedule
 */
export async function createPresetSchedule(
  deviceId: string, 
  presetName: string, 
  deviceZones: Array<{station: number, name: string}>
): Promise<{ success: boolean; scheduleId: string; tasks: WateringTask[] }> {
  
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const scheduleId = `preset-${presetName}-${Date.now()}`;
  const tasks: WateringTask[] = [];
  let currentTime = Date.now();

  for (const presetTask of preset.tasks) {
    // Find the zone that matches the preset task name
    const zone = findZoneByName(deviceZones, presetTask.stationName);
    
    if (!zone) {
      console.warn(`[Scheduler] Zone not found for "${presetTask.stationName}" in device ${deviceId}`);
      continue;
    }

    const task: WateringTask = {
      id: `${scheduleId}-${presetTask.sequence}`,
      deviceId,
      station: zone.station,
      duration: presetTask.duration,
      scheduledTime: currentTime,
      status: 'pending',
      presetName,
      sequence: presetTask.sequence,
      createdAt: currentTime,
      updatedAt: currentTime
    };

    tasks.push(task);
    
    // Schedule next task after current task duration + 5 second buffer
    currentTime += (presetTask.duration * 60 * 1000) + 5000;
  }

  // Store all tasks in DynamoDB
  for (const task of tasks) {
    await dynamoDBClient.send(new PutCommand({
      TableName: scheduleTableName,
      Item: task
    }));
  }

  console.log(`[Scheduler] Created ${tasks.length} tasks for preset "${presetName}"`);
  
  // Start the first task immediately
  if (tasks.length > 0) {
    await executeTask(tasks[0]);
  }

  return {
    success: true,
    scheduleId,
    tasks
  };
}

/**
 * Execute a specific watering task
 */
async function executeTask(task: WateringTask): Promise<void> {
  try {
    console.log(`[Scheduler] Executing task ${task.id}: Station ${task.station} for ${task.duration} minutes`);
    
    // Update task status to running
    await updateTaskStatus(task.id, 'running');
    
    // Start watering via bhyve
    await bhyve.startWatering(task.deviceId, task.station, task.duration);
    
    // Schedule the next task in the sequence
    setTimeout(async () => {
      try {
        await updateTaskStatus(task.id, 'completed');
        await executeNextTask(task);
      } catch (error) {
        console.error(`[Scheduler] Error completing task ${task.id}:`, error);
        await updateTaskStatus(task.id, 'failed');
      }
    }, task.duration * 60 * 1000 + 5000); // Duration + 5 second buffer
    
  } catch (error) {
    console.error(`[Scheduler] Error executing task ${task.id}:`, error);
    await updateTaskStatus(task.id, 'failed');
    throw error;
  }
}

/**
 * Execute the next task in sequence
 */
async function executeNextTask(completedTask: WateringTask): Promise<void> {
  if (!completedTask.presetName) {
    return; // No preset, nothing to continue
  }

  // Find the next task in sequence using a simple scan
  const nextSequence = completedTask.sequence + 1;
  
  try {
    const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const result = await dynamoDBClient.send(new ScanCommand({
      TableName: scheduleTableName,
      FilterExpression: 'presetName = :presetName AND #seq = :sequence AND deviceId = :deviceId AND createdAt = :createdAt',
      ExpressionAttributeNames: {
        '#seq': 'sequence'
      },
      ExpressionAttributeValues: {
        ':presetName': completedTask.presetName,
        ':sequence': nextSequence,
        ':deviceId': completedTask.deviceId,
        ':createdAt': completedTask.createdAt
      }
    }));

    if (result.Items && result.Items.length > 0) {
      const nextTask = result.Items[0] as WateringTask;
      console.log(`[Scheduler] Found next task in sequence: ${nextTask.id}`);
      await executeTask(nextTask);
    } else {
      console.log(`[Scheduler] No more tasks in sequence for preset "${completedTask.presetName}"`);
    }
  } catch (error) {
    console.error(`[Scheduler] Error finding next task:`, error);
  }
}

/**
 * Update task status
 */
async function updateTaskStatus(taskId: string, status: WateringTask['status']): Promise<void> {
  await dynamoDBClient.send(new UpdateCommand({
    TableName: scheduleTableName,
    Key: { id: taskId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': Date.now()
    }
  }));

  // Broadcast status update to WebSocket clients
  await broadcastScheduleUpdate(taskId, status);
}

/**
 * Broadcast schedule updates to connected WebSocket clients
 */
async function broadcastScheduleUpdate(taskId: string, status: string): Promise<void> {
  try {
    console.log(`[Scheduler] Broadcasting update: Task ${taskId} status: ${status}`);
    
    // Get the task details for the broadcast
    const result = await dynamoDBClient.send(new GetCommand({
      TableName: scheduleTableName,
      Key: { id: taskId }
    }));
    
    if (!result.Item) {
      console.warn(`[Scheduler] Task ${taskId} not found for broadcast`);
      return;
    }
    
    const task = result.Item as WateringTask;
    
    // Broadcast to all connected WebSocket clients
    // Note: In a production system, this would connect to the existing WebSocket API
    // For now, we'll prepare the message structure for integration
    const updateMessage = {
      type: 'bhyve_schedule_update',
      data: {
        taskId: task.id,
        deviceId: task.deviceId,
        station: task.station,
        status: status,
        presetName: task.presetName,
        sequence: task.sequence,
        timestamp: Date.now()
      }
    };
    
    console.log(`[Scheduler] Update message prepared:`, updateMessage);
    
    // TODO: Connect to existing WebSocket infrastructure from api.ts
    // This would require querying the connections table and sending to all clients
    // For now, the frontend polling will pick up the changes
    
  } catch (error) {
    console.error(`[Scheduler] Error broadcasting update:`, error);
  }
}

/**
 * Find zone by name (fuzzy matching)
 */
function findZoneByName(zones: Array<{station: number, name: string}>, targetName: string): {station: number, name: string} | null {
  const lowerTarget = targetName.toLowerCase();
  
  // Try exact match first
  let zone = zones.find(z => z.name.toLowerCase() === lowerTarget);
  if (zone) return zone;
  
  // Try partial matches
  if (lowerTarget.includes('front') && lowerTarget.includes('flower')) {
    zone = zones.find(z => {
      const lowerName = z.name.toLowerCase();
      return lowerName.includes('front') && (lowerName.includes('flower') || lowerName.includes('bed'));
    });
    if (zone) return zone;
  }
  
  if (lowerTarget.includes('back')) {
    zone = zones.find(z => {
      const lowerName = z.name.toLowerCase();
      return lowerName.includes('back') && (lowerName.includes('yard') || lowerName.includes('lawn'));
    });
    if (zone) return zone;
    
    // Also try just "backyard" as a single word
    zone = zones.find(z => z.name.toLowerCase().includes('backyard'));
    if (zone) return zone;
  }
  
  // Try broader matches
  if (lowerTarget.includes('flower')) {
    zone = zones.find(z => z.name.toLowerCase().includes('flower') || z.name.toLowerCase().includes('bed'));
    if (zone) return zone;
  }
  
  if (lowerTarget.includes('yard') || lowerTarget.includes('back')) {
    zone = zones.find(z => {
      const lowerName = z.name.toLowerCase();
      return lowerName.includes('yard') || lowerName.includes('back') || lowerName.includes('lawn');
    });
    if (zone) return zone;
  }
  
  // Special handling for specific zone names
  if (lowerTarget === 'backyard') {
    // Try to find any zone that could be the backyard
    zone = zones.find(z => {
      const lowerName = z.name.toLowerCase();
      return lowerName.includes('back') || lowerName === 'backyard' || 
             (lowerName.includes('yard') && !lowerName.includes('front')) ||
             z.station === 3; // Assume zone 3 is backyard if other matches fail
    });
    if (zone) return zone;
  }
  
  return null;
}

/**
 * Get active schedules for a device
 */
export async function getActiveSchedules(deviceId: string): Promise<WateringTask[]> {
  try {
    // For now, scan the table since we don't have the GSI set up properly yet
    // This is inefficient but will work for the limited data we have
    const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
    
    const result = await dynamoDBClient.send(new ScanCommand({
      TableName: scheduleTableName,
      FilterExpression: 'deviceId = :deviceId AND (#status = :pending OR #status = :running)',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':deviceId': deviceId,
        ':pending': 'pending',
        ':running': 'running'
      }
    }));

    return (result.Items || []) as WateringTask[];
  } catch (error) {
    console.error(`[Scheduler] Error getting active schedules:`, error);
    return [];
  }
}

/**
 * Cancel all active schedules for a device
 */
export async function cancelActiveSchedules(deviceId: string): Promise<void> {
  const activeSchedules = await getActiveSchedules(deviceId);
  
  for (const schedule of activeSchedules) {
    await updateTaskStatus(schedule.id, 'failed');
  }
  
  console.log(`[Scheduler] Cancelled ${activeSchedules.length} active schedules for device ${deviceId}`);
}
