**CasaGuard – System Design and Requirements Document**

### **1\. Introduction**

**CasaGuard** is a cloud-based home automation and security system that enables users to monitor and control smart home devices in real-time, including lights, thermostats, cameras, and security alarms. By integrating with external services like Google Nest, TP-Link, and Airthings, it provides a unified platform for managing home automation, security, and air quality. Built on a serverless AWS architecture, CasaGuard ensures scalability, reliability, security, and ease of maintenance, delivering an intuitive and responsive experience across web and mobile platforms.

#### **1.1 Purpose**

CasaGuard aims to empower homeowners with a secure, user-friendly solution for:

* Real-time monitoring and control of smart devices.  
* Managing security systems with event logging and notifications.  
* Automating tasks based on user preferences and location.  
* Accessing live and recorded video feeds.  
* Monitoring air quality through sensor integrations.

#### **1.2 Scope**

This document outlines CasaGuard’s system architecture, components, functionality, security measures, scalability features, and setup requirements, serving as a comprehensive guide for development, deployment, and maintenance.

### **2\. Key Features**

* **Real-time Device Control**: Manage lights, thermostats, cameras, and other devices remotely.  
* **Security Management**: Arm/disarm alarms, log events, and receive instant alerts.  
* **Location-based Automation**: Adjust settings based on users’ home/away status.  
* **External Integrations**: Connect with Google Nest (thermostats, cameras), TP-Link (lights), Airthings (air quality), and more.  
* **Real-time Updates**: Deliver instant notifications and updates via WebSocket and push notifications.  
* **Video Streaming**: Provide live and recorded video feeds with cloud storage.  
* **Air Quality Monitoring**: Display sensor data (e.g., radon, CO2) with quality assessments.

### **3\. System Architecture**

CasaGuard leverages a serverless, cloud-native architecture on AWS to handle varying workloads efficiently. It uses RESTful APIs, WebSocket connections, and external integrations to ensure seamless communication across components.

#### **3.1 High-Level Overview**

* **Frontend**:  
  * React-based web application (TypeScript) hosted on Amazon S3.  
  * Native iOS app (Swift) for mobile access.  
* **Backend**: AWS Lambda functions (Node.js, Python) process requests, manage integrations, and handle real-time communication.  
* **Database**: Amazon DynamoDB for scalable, low-latency data storage.  
* **Real-time Communication**: WebSocket API for instant client updates.  
* **External Integrations**: APIs connect to Google Nest, TP-Link, Airthings, and Apple Push Notification Service (APNs).  
* **Video Streaming**: Python scripts and Amazon S3 handle video capture, storage, and playback.

#### **3.2 Architecture Diagram (Textual Representation)**

text  
Copy  
`Frontend (React) <-> REST API <-> Lambda (API Handlers)`  
`Frontend (React) <-> WebSocket API <-> Lambda (WebSocket Handler)`  
`iOS App <-> REST API <-> Lambda (API Handlers)`  
`iOS App <-> WebSocket API <-> Lambda (WebSocket Handler)`  
`Lambda <-> DynamoDB (EventLogs, AlarmState, UserHomeStates2, GuardConnectionsTable, Homes)`  
`Lambda <-> External Services (Google Nest, TP-Link, Airthings, APNs)`  
`Python Scripts <-> S3 (Video Storage)`  
`Frontend/iOS App <-> S3 (Video Streaming via HLS)`

### **4\. System Components**

#### **4.1 Frontend (Web Application)**

* **Technology**: React with TypeScript  
* **Purpose**: Provides a responsive web interface for interacting with smart home devices.  
* **Features**:  
  * Displays live camera feeds, device controls (lights, thermostats), and event logs.  
  * Allows security settings management (arm/disarm).  
  * Receives real-time updates via WebSocket.  
  * Optimized for desktop and mobile (e.g., iOS Safari) with lazy loading and memoization.

#### **4.2 iOS Application**

* **Technology**: Swift  
* **Purpose**: Offers mobile access with location-based automation and notifications.  
* **Features**:  
  * Tracks user location to update home/away status.  
  * Sends push notifications for critical events via APNs.  
  * Connects to WebSocket API for real-time updates.

#### **4.3 Backend (AWS Lambda Functions)**

* **Technology**: Node.js, Python  
* **Purpose**: Handles business logic, API processing, and integrations.  
* **Key Functions**:  
  * Processes user commands (e.g., toggle lights, arm alarm).  
  * Manages WebSocket connections for real-time updates.  
  * Integrates with external APIs and DynamoDB.

#### **4.4 DynamoDB Tables**

* **Purpose**: Stores system data with low-latency access.  
* **Key Tables**:  
  * **EventLogs**: Records events (e.g., door opened) with a 7-day TTL.  
  * **AlarmState**: Tracks security state per home (e.g., Arm Stay, Disarm).  
  * **UserHomeStates2**: Stores user home/away status and display names.  
  * **GuardConnectionsTable**: Manages WebSocket connection details.  
  * **Homes**: Holds home configuration and integration settings.

#### **4.5 WebSocket API**

* **Purpose**: Enables real-time, bidirectional communication.  
* **Functionality**:  
  * Pushes updates (e.g., alarm triggers, device status) to clients.  
  * Receives and processes client commands instantly.

#### **4.6 RESTful APIs**

* **Purpose**: Facilitates structured communication.  
* **Key APIs**:  
  * **Integration API**: Connects to external services (Google Nest, TP-Link, Airthings).  
  * **Admin API**: Manages user setup, homes, and configurations.  
  * **APNs API**: Handles iOS push notifications.

#### **4.7 External Integrations**

* **Google Nest**: Controls thermostats and cameras (OAuth2 authentication).  
* **TP-Link**: Manages smart lights (cloud credentials).  
* **Airthings**: Retrieves air quality data (client credentials).  
* **APNs**: Sends iOS push notifications (certificates/keys).

#### **4.8 Video Streaming**

* **Purpose**: Delivers live and recorded camera feeds.  
* **Implementation**:  
  * Python scripts capture/process video, uploading to S3.  
  * Clients access streams via HLS from S3.

### **5\. System Functionality**

#### **5.1 Home Automation**

* **Device Control**: Manage lights (TP-Link, Hue), thermostats (Google Nest), and cameras.  
* **Real-time Monitoring**: View live feeds and sensor data (e.g., temperature, air quality).

#### **5.2 Security Management**

* **Alarm Control**: Arm (Stay/Away) or disarm systems.  
* **Event Logging**: Store and display events (e.g., door openings).  
* **Notifications**: Send alerts for critical events via WebSocket and APNs.

#### **5.3 Location-based Automation**

* iOS app tracks user location to update home/away status.  
* Backend adjusts settings (e.g., arm system when users leave).

#### **5.4 Air Quality Monitoring**

* Integrates with Airthings to monitor metrics (radon, CO2, VOC).  
* Displays data with assessments (good, fair, poor) in the UI.

#### **5.5 Real-time Updates**

* WebSocket pushes immediate updates on device status, alarms, and events.  
* APNs delivers notifications to iOS users.

### **6\. Data Flow**

1. **User Interactions**:  
   * Commands (e.g., "turn on light") sent via frontend/iOS app to REST APIs.  
   * Lambda processes requests, interacts with external services/DynamoDB, and responds.  
2. **Real-time Updates**:  
   * Changes (e.g., alarm state) written to DynamoDB.  
   * WebSocket API pushes updates to connected clients.  
3. **External Service Interactions**:  
   * Lambda calls external APIs to fetch/send data.  
   * Data stored in DynamoDB or pushed to clients.  
4. **Location-based Automation**:  
   * iOS app updates location via REST API.  
   * Backend adjusts settings based on logic.

### **7\. Security**

* **Authentication**: AWS Cognito for identity and access control.  
* **Authorization**: IAM roles ensure fine-grained resource access.  
* **Data Encryption**:  
  * SSM Parameters store sensitive data (API keys, credentials).  
  * HTTPS secures all communications.  
* **Access Control**: Policies restrict AWS resource usage.

### **8\. Scalability and Performance**

* **Serverless Architecture**:  
  * AWS Lambda and API Gateway scale automatically with demand.  
  * DynamoDB provides low-latency, scalable storage.  
* **WebSocket Management**: Tracks connections efficiently in DynamoDB.  
* **Frontend Optimizations**:  
  * Lazy loading reduces load times.  
  * Memoization improves rendering performance.  
* **Video Streaming**: HLS and S3 ensure efficient delivery.

### **9\. Setup and Dependencies**

#### **9.1 AWS Services**

* **API Gateway**: Manages REST/WebSocket APIs.  
* **Lambda**: Executes serverless functions.  
* **DynamoDB**: Stores system data.  
* **Cognito**: Handles authentication.  
* **SSM**: Secures credentials.  
* **S3**: Hosts frontend and stores video.

#### **9.2 External Service Accounts**

* **Google Nest**: OAuth2 credentials (client ID, secret, refresh token).  
* **TP-Link**: Cloud username, password, terminal UUID.  
* **Airthings**: Client ID and secret.  
* **APNs**: Certificates and keys.

#### **9.3 Development and Deployment**

* **Frontend**: React/TypeScript, deployed to S3.  
* **iOS App**: Swift, deployed via Xcode to App Store.  
* **Backend**: Lambda functions (Node.js, Python), deployed via AWS CDK.  
* **Infrastructure**: AWS CDK scripts provision resources.

### **10\. Conclusion**

CasaGuard integrates smart devices, security features, and air quality monitoring into a scalable, serverless platform powered by AWS. With real-time updates, robust integrations, and a user-friendly interface across web and mobile, it delivers a modern solution for home automation and security, ensuring flexibility, reliability, and performance.