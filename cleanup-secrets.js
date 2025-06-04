#!/usr/bin/env node

/**
 * Cleanup script to identify and remove hardcoded secrets from the manor monorepo
 */

const fs = require('fs');
const path = require('path');

const SECRETS_PATTERNS = [
  {
    pattern: /aws_access_key_id\s*=\s*['"][^'"]+['"]/gi,
    replacement: "aws_access_key_id = os.environ.get('AWS_ACCESS_KEY_ID')",
    description: "AWS Access Key ID"
  },
  {
    pattern: /aws_secret_access_key\s*=\s*['"][^'"]+['"]/gi,
    replacement: "aws_secret_access_key = os.environ.get('AWS_SECRET_ACCESS_KEY')",
    description: "AWS Secret Access Key"
  },
  {
    pattern: /REACT_APP_USER_POOL_CLIENT_ID=\w+/gi,
    replacement: "REACT_APP_USER_POOL_CLIENT_ID=${USER_POOL_CLIENT_ID}",
    description: "User Pool Client ID"
  }
];

const FILES_TO_CHECK = [
  'packages/cdk/programs/**/*.py',
  'packages/website/.env.production',
  'packages/website/.env',
  'packages/cdk/**/*.ts',
  'packages/cdk/**/*.js'
];

function findFilesRecursively(dir, pattern) {
  const files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        traverse(fullPath);
      } else if (stat.isFile() && pattern.test(item)) {
        files.push(fullPath);
      }
    }
  }
  
  try {
    traverse(dir);
  } catch (error) {
    console.warn(`Could not traverse directory ${dir}: ${error.message}`);
  }
  
  return files;
}

function cleanupSecrets() {
  console.log('🔍 Scanning for hardcoded secrets...\n');
  
  const rootDir = process.cwd();
  const pythonFiles = findFilesRecursively(rootDir, /\.py$/);
  const envFiles = findFilesRecursively(rootDir, /\.env/);
  const jsFiles = findFilesRecursively(rootDir, /\.(ts|js)$/);
  
  const allFiles = [...pythonFiles, ...envFiles, ...jsFiles];
  let foundSecrets = false;
  
  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let modifiedContent = content;
      let fileModified = false;
      
      for (const secretPattern of SECRETS_PATTERNS) {
        const matches = content.match(secretPattern.pattern);
        if (matches) {
          console.log(`⚠️  Found ${secretPattern.description} in ${filePath}`);
          foundSecrets = true;
          
          // Replace the secret with environment variable
          modifiedContent = modifiedContent.replace(secretPattern.pattern, secretPattern.replacement);
          fileModified = true;
        }
      }
      
      if (fileModified) {
        // Create backup
        fs.writeFileSync(filePath + '.backup', content);
        fs.writeFileSync(filePath, modifiedContent);
        console.log(`✅ Cleaned up secrets in ${filePath} (backup created)`);
      }
      
    } catch (error) {
      console.warn(`Could not process ${filePath}: ${error.message}`);
    }
  }
  
  if (!foundSecrets) {
    console.log('✅ No hardcoded secrets found!');
  } else {
    console.log('\n📋 Next steps:');
    console.log('1. Set up environment variables for AWS credentials');
    console.log('2. Configure GitHub repository secrets');
    console.log('3. Update deployment scripts to use environment variables');
    console.log('4. Remove .backup files after verification');
  }
}

function addEnvironmentSetup() {
  const envExampleContent = `# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_REGION=us-east-1

# Cognito Configuration  
USER_POOL_CLIENT_ID=your_user_pool_client_id_here

# API Configuration
REACT_APP_API_BASE_URL=https://your-api-domain.com
REACT_APP_WS_URL=wss://your-websocket-domain.com

# Apple Sign-In Configuration (if using)
REACT_APP_APPLE_CLIENT_ID=your_apple_client_id_here
`;

  const rootEnvPath = path.join(process.cwd(), '.env.example');
  if (!fs.existsSync(rootEnvPath)) {
    fs.writeFileSync(rootEnvPath, envExampleContent);
    console.log('✅ Created .env.example file in root directory');
  }
}

if (require.main === module) {
  cleanupSecrets();
  addEnvironmentSetup();
}

module.exports = { cleanupSecrets, addEnvironmentSetup };
