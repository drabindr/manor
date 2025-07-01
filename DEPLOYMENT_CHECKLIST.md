# 🌸 Bhyve Flowers Preset - Deployment Checklist

## Pre-Deployment Checklist

### ✅ Code Changes Completed

- [x] Created `wateringScheduler.ts` with preset logic
- [x] Updated `integrationHandler.ts` with new endpoints
- [x] Added DynamoDB table to CDK stack
- [x] Updated frontend with Flowers preset button
- [x] Added status tracking and cancellation support
- [x] Created comprehensive test script
- [x] Documented implementation

### ✅ Infrastructure Requirements

- [ ] DynamoDB table `BhyveWateringSchedule` will be created
- [ ] Lambda function permissions updated for new table
- [ ] API Gateway endpoints for presets added
- [ ] Environment variables configured

## Deployment Steps

### 1. Build and Deploy Backend

```bash
cd packages/cdk
npm install
npm run build
cdk deploy CasaIntegrationsCdkStack
```

**Expected outputs:**
- New DynamoDB table created
- Lambda function updated with new code
- API endpoints available

### 2. Deploy Frontend

```bash
cd packages/website
npm install
npm run build
# Deploy to your hosting platform
```

### 3. Verify Deployment

Run the test script:
```bash
./test-flowers-preset.sh
```

## Post-Deployment Testing

### ✅ Backend Testing

- [ ] API endpoints respond correctly
- [ ] DynamoDB table accessible
- [ ] Bhyve integration still works
- [ ] Logging appears in CloudWatch

### ✅ Frontend Testing

- [ ] Flowers preset button appears
- [ ] Button styling correct
- [ ] API calls successful
- [ ] Real-time updates working
- [ ] Cancellation functional

### ✅ Integration Testing

- [ ] Zone detection finds correct zones
- [ ] Sequential watering works
- [ ] Status updates cross-device
- [ ] Error handling graceful

## Rollback Plan

If issues occur:

### 1. Quick Rollback (Frontend)
- Revert frontend changes
- Comment out Flowers preset button
- Existing functionality preserved

### 2. Backend Rollback
```bash
cd packages/cdk
git checkout HEAD~1 -- lib/casa-integrations-cdk-stack.ts
git checkout HEAD~1 -- lambda/casa-integrations/integrationHandler.ts
cdk deploy CasaIntegrationsCdkStack
```

### 3. Database Cleanup
```bash
# If needed, manually clean up DynamoDB table
aws dynamodb delete-table --table-name BhyveWateringSchedule
```

## Monitoring

### ✅ CloudWatch Metrics to Watch

- [ ] Lambda function errors
- [ ] DynamoDB read/write capacity
- [ ] API Gateway error rates
- [ ] Bhyve API response times

### ✅ Logs to Monitor

- [ ] Integration Lambda logs
- [ ] Scheduler execution logs
- [ ] Frontend console errors
- [ ] Bhyve API errors

## Support Information

### Key Configurations

- **Device ID**: Found in Bhyve devices list
- **Zone Names**: Must match fuzzy matching logic
- **API Base**: `https://m3jx6c8bh2.execute-api.us-east-1.amazonaws.com/prod`

### Common Fixes

1. **Zone not found**: Check zone names in Bhyve app
2. **Preset not starting**: Verify device ID and connectivity
3. **UI not updating**: Check API calls in browser console
4. **Backend errors**: Review CloudWatch logs

### Contact Information

- **Technical Issues**: Check CloudWatch logs first
- **Feature Requests**: Document in project issues
- **Bhyve API Issues**: Verify credentials in Parameter Store

---

## 🎉 Success Criteria

The deployment is successful when:

1. ✅ Flowers preset button appears in UI
2. ✅ Clicking button starts sequential watering
3. ✅ Front flower bed waters for ~1 minute
4. ✅ Brief pause (~5 seconds)
5. ✅ Backyard waters for ~1 minute
6. ✅ Status updates appear real-time
7. ✅ Cancellation works correctly
8. ✅ All existing features unaffected

**Happy watering! 🌸💧**
