import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface EmailSubmission {
  email: string;
  timestamp: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://mymanor.click',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const { email }: { email: string } = JSON.parse(event.body);

    if (!email || !isValidEmail(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid email address is required' }),
      };
    }

    // Send notification email
    const notificationEmailParams = {
      Source: process.env.NOTIFICATION_EMAIL!, // Use verified email as sender
      Destination: {
        ToAddresses: [process.env.NOTIFICATION_EMAIL!], // Your personal email (from environment)
      },
      Message: {
        Subject: {
          Data: 'New Manor Public Website Email Signup',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: `
              <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 10px;">
                      New Email Signup - Manor Public Website
                    </h2>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="margin-top: 0; color: #495057;">Signup Details:</h3>
                      <p><strong>Email:</strong> ${email}</p>
                      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                      <p><strong>Source:</strong> Manor Public Website (mymanor.click)</p>
                    </div>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                      <p style="margin: 0; color: #6c757d; font-size: 14px;">
                        This notification was automatically generated from the Manor public website email signup form.
                      </p>
                    </div>
                  </div>
                </body>
              </html>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: `
New Email Signup - Manor Public Website

Email: ${email}
Timestamp: ${new Date().toISOString()}
Source: Manor Public Website (mymanor.click)

This notification was automatically generated from the Manor public website email signup form.
            `,
            Charset: 'UTF-8',
          },
        },
      },
    };

    await ses.send(new SendEmailCommand(notificationEmailParams));

    // TODO: Send confirmation email to user once noreply@mymanor.click is verified
    // For now, only send notification to admin since we're in SES sandbox mode
    /*
    const confirmationEmailParams = {
      Source: process.env.SENDER_EMAIL!,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: 'Welcome to Manor - Subscription Confirmed',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: `
              <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <h1 style="color: #ea580c; margin: 0;">Manor</h1>
                      <p style="color: #6c757d; margin: 5px 0 0 0;">Smart Home Platform</p>
                    </div>
                    
                    <h2 style="color: #495057;">Welcome to Manor!</h2>
                    
                    <p>Thank you for subscribing to Manor updates! We're excited to have you join our community.</p>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                      <h3 style="margin-top: 0; color: #495057;">What's Next?</h3>
                      <ul style="margin: 0; padding-left: 20px;">
                        <li>You'll be the first to know about product releases</li>
                        <li>Get exclusive updates on new features</li>
                        <li>Receive early access opportunities</li>
                        <li>Stay informed about Manor community events</li>
                      </ul>
                    </div>
                    
                    <p>Visit our website anytime: <a href="https://mymanor.click" style="color: #ea580c;">mymanor.click</a></p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
                      <p style="margin: 0; color: #6c757d; font-size: 14px;">
                        You can unsubscribe at any time by replying to this email. We respect your privacy and will never share your information.
                      </p>
                    </div>
                  </div>
                </body>
              </html>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: `
Welcome to Manor!

Thank you for subscribing to Manor updates! We're excited to have you join our community.

What's Next?
- You'll be the first to know about product releases
- Get exclusive updates on new features  
- Receive early access opportunities
- Stay informed about Manor community events

Visit our website anytime: https://mymanor.click

You can unsubscribe at any time by replying to this email. We respect your privacy and will never share your information.
            `,
            Charset: 'UTF-8',
          },
        },
      },
    };

    await ses.send(new SendEmailCommand(confirmationEmailParams));
    */

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Email submitted successfully! We\'ll be in touch soon.' 
      }),
    };

  } catch (error) {
    console.error('Error processing email submission:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error. Please try again later.' 
      }),
    };
  }
};

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
