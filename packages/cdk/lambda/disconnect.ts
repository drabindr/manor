import { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const connectionsTableName = process.env.CONN_TABLE_NAME || 'GuardConnectionsTable';
const alarmStateTableName = process.env.ALARM_STATE_TABLE_NAME || 'AlarmState';

export const handler = async (event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2> => {
    console.log('Disconnect Event:', JSON.stringify(event, null, 2));
    
    const connectionId = event.requestContext.connectionId;
    
    try {
        // First, get details about the connection before we delete it
        let connectionDetails;
        try {
            const getResult = await client.send(new GetCommand({
                TableName: connectionsTableName,
                Key: { connectionId }
            }));
            connectionDetails = getResult.Item;
        } catch (error) {
            console.error(`Error retrieving connection details for ${connectionId}:`, error);
            // Continue with deletion even if we couldn't get details
        }
        
        // Delete the connection from the connections table
        await client.send(new DeleteCommand({
            TableName: connectionsTableName,
            Key: { connectionId }
        }));
        
        console.log(`Successfully deleted connection ${connectionId}`);
        
        // If this was a casa-main connection, update the AlarmState table
        if (connectionDetails && 
            (connectionDetails.instanceType === 'casa-main' || connectionDetails.instanceType === 'Casa-Main') && 
            connectionDetails.homeId) {
            
            console.log(`Disconnected casa-main instance for home ${connectionDetails.homeId}`);
            
            try {
                // Get the current alarm state
                const getAlarmState = await client.send(new GetCommand({
                    TableName: alarmStateTableName,
                    Key: { id: connectionDetails.homeId }
                }));
                
                // Only update if this is the same instance that's currently registered
                if (getAlarmState.Item && getAlarmState.Item.instanceId === connectionDetails.instanceId) {
                    console.log(`Updating AlarmState for home ${connectionDetails.homeId} to disconnected`);
                    
                    // Update the AlarmState table to show this home as disconnected
                    await client.send(new UpdateCommand({
                        TableName: alarmStateTableName,
                        Key: { id: connectionDetails.homeId },
                        UpdateExpression: 'SET connected = :connected, lastUpdated = :lastUpdated',
                        ExpressionAttributeValues: {
                            ':connected': false,
                            ':lastUpdated': new Date().toISOString()
                        }
                    }));
                    
                    console.log(`Successfully marked home ${connectionDetails.homeId} as disconnected`);
                } else {
                    console.log(`Not updating AlarmState for home ${connectionDetails.homeId} - instance ID mismatch or no existing state`);
                }
            } catch (error) {
                console.error(`Error updating alarm state for home ${connectionDetails.homeId}:`, error);
            }
        }
        
        return { statusCode: 200, body: 'Disconnected.' };
    } catch (error) {
        console.error(`Error removing connection ${connectionId}:`, error);
        return { statusCode: 500, body: 'Error disconnecting.' };
    }
};
