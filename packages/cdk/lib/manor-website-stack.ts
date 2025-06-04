import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface ManorWebsiteStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
  websiteBuildPath?: string; // Optional path to website build directory
  skipWebsiteDeployment?: boolean; // Skip website content deployment (for CI/CD)
}

export class ManorWebsiteStack extends cdk.Stack {
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly certificate: certificatemanager.Certificate;

  constructor(scope: Construct, id: string, props: ManorWebsiteStackProps) {
    super(scope, id, props);

    // Create certificate for the subdomain
    this.certificate = new certificatemanager.Certificate(this, 'VeeduWebsiteCertificate', {
      domainName: props.domainName, // 720frontrd.mymanor.click
      validation: certificatemanager.CertificateValidation.fromDns(props.hostedZone),
    });

    // Create S3 bucket for Veedu website hosting (using REST API endpoint for OAC)
    this.websiteBucket = new s3.Bucket(this, 'VeeduWebsiteBucket', {
      // Remove website configuration to use REST API endpoint for OAC
      publicReadAccess: false, // We'll use CloudFront OAC instead
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep the bucket if stack is deleted
      versioned: true,
      lifecycleRules: [{
        id: 'DeleteOldVersions',
        enabled: true,
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
    });

    // Create CloudFront distribution with explicit S3 origin configuration for React SPA
    this.distribution = new cloudfront.Distribution(this, 'VeeduWebsiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originId: 'VeeduWebsiteS3Origin',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      domainNames: [props.domainName], // 720frontrd.mymanor.click
      certificate: this.certificate, // Use the subdomain certificate
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0), // No caching for SPA routing
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0), // No caching for SPA routing
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'CA', 'GB', 'DE', 'FR', 'AU'), // Allow only selected countries
      enableLogging: false, // Disable logging for now
    });

    // Add bucket policy to allow CloudFront access
    this.websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.websiteBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Stack.of(this).account}:distribution/${this.distribution.distributionId}`,
          },
        },
      })
    );

    // Create Route 53 records for the domain
    new route53.ARecord(this, 'VeeduWebsiteARecord', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Note: 720frontrd.mymanor.click will be served by this CloudFront distribution

    // Outputs
    new cdk.CfnOutput(this, 'VeeduWebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 bucket name for Veedu website',
      exportName: 'VeeduWebsiteBucketName',
    });

    new cdk.CfnOutput(this, 'VeeduCloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for Veedu website',
      exportName: 'VeeduCloudFrontDistributionId',
    });

    new cdk.CfnOutput(this, 'VeeduCloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name for Veedu website',
      exportName: 'VeeduCloudFrontDomainName',
    });

    new cdk.CfnOutput(this, 'VeeduWebsiteUrl', {
      value: `https://${props.domainName}`,
      description: 'Veedu website URL',
      exportName: 'VeeduWebsiteUrl',
    });

    // Automatically deploy website content from the built React app
    // Use configurable path to support both local and CI environments
    // Skip deployment if explicitly requested (for CI/CD pipelines)
    if (!props.skipWebsiteDeployment) {
      const websiteBuildPath = props.websiteBuildPath || '../veedu-website/build';
      const websiteDeployment = new s3deploy.BucketDeployment(this, 'VeeduWebsiteDeployment', {
        sources: [s3deploy.Source.asset(websiteBuildPath)],
        destinationBucket: this.websiteBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        prune: true, // Remove files not in the source
        retainOnDelete: false,
        memoryLimit: 512,
        ephemeralStorageSize: cdk.Size.mebibytes(1024),
      });

      // Output deployment info
      new cdk.CfnOutput(this, 'VeeduWebsiteDeploymentComplete', {
        value: 'Website deployed successfully',
        description: 'Confirms website content deployment',
      });
    } else {
      // Output info about skipped deployment
      new cdk.CfnOutput(this, 'VeeduWebsiteDeploymentSkipped', {
        value: 'Website deployment skipped - handle separately',
        description: 'Website content deployment was skipped',
      });
    }
  }
}
