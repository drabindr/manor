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

interface ManorPublicWebsiteStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
  websiteBuildPath?: string; // Optional path to website build directory
  skipWebsiteDeployment?: boolean; // Skip website content deployment (for CI/CD)
}

export class ManorPublicWebsiteStack extends cdk.Stack {
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly certificate: certificatemanager.Certificate;

  constructor(scope: Construct, id: string, props: ManorPublicWebsiteStackProps) {
    super(scope, id, props);

    // Create certificate for the main domain (mymanor.click)
    this.certificate = new certificatemanager.Certificate(this, 'PublicWebsiteCertificate', {
      domainName: props.domainName, // mymanor.click
      validation: certificatemanager.CertificateValidation.fromDns(props.hostedZone),
    });

    // Create S3 bucket for public website hosting
    this.websiteBucket = new s3.Bucket(this, 'PublicWebsiteBucket', {
      bucketName: `manor-public-website-${this.account}-${Date.now()}`,
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

    // Create CloudFront distribution with optimized caching for public website
    this.distribution = new cloudfront.Distribution(this, 'PublicWebsiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originId: 'PublicWebsiteS3Origin',
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true, // Enable compression for all content
        cachePolicy: new cloudfront.CachePolicy(this, 'PublicWebsiteCachePolicy', {
          cachePolicyName: 'ManorPublicWebsiteOptimized',
          comment: 'Optimized caching for Manor public website',
          defaultTtl: cdk.Duration.hours(24), // 24 hours default
          maxTtl: cdk.Duration.days(365), // 1 year max for static assets
          minTtl: cdk.Duration.seconds(0), // Allow instant invalidation
          headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
            'CloudFront-Viewer-Country',
            'CloudFront-Is-Mobile-Viewer'
          ),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
        }),
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'PublicWebsiteSecurityHeaders', {
          responseHeadersPolicyName: 'ManorPublicWebsiteSecurity',
          comment: 'Security headers for Manor public website',
          securityHeadersBehavior: {
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            referrerPolicy: { 
              referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
              override: true 
            },
            strictTransportSecurity: {
              accessControlMaxAge: cdk.Duration.seconds(31536000), // 1 year
              includeSubdomains: true,
              preload: true,
              override: true,
            },
            contentSecurityPolicy: {
              contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' fonts.gstatic.com; connect-src 'self' https://rqpb2oof21.execute-api.us-east-1.amazonaws.com;",
              override: true,
            },
          },
          customHeadersBehavior: {
            customHeaders: [
              {
                header: 'X-Powered-By',
                value: 'Manor-Public-CloudFront',
                override: true,
              },
              {
                header: 'X-Cache-Optimized',
                value: 'true',
                override: true,
              },
            ],
          },
        }),
      },
      // Additional behaviors for static assets with aggressive caching
      additionalBehaviors: {
        // Static assets with long-term caching
        '/assets/*': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
          cachePolicy: new cloudfront.CachePolicy(this, 'StaticAssetsCachePolicy', {
            cachePolicyName: 'ManorPublicStaticAssetsOptimized',
            comment: 'Aggressive caching for static assets',
            defaultTtl: cdk.Duration.days(30),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.days(1),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept-Encoding'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          }),
        },
        // Images with medium-term caching
        '*.png': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.jpg': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        '*.svg': {
          origin: new origins.S3Origin(this.websiteBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      domainNames: [props.domainName], // mymanor.click only
      certificate: this.certificate,
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
      geoRestriction: cloudfront.GeoRestriction.allowlist('US', 'CA', 'GB', 'DE', 'FR', 'AU', 'IN'), // Allow selected countries
      enableLogging: false, // Disable logging for now
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
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

    // Create Route 53 record for the main domain only
    new route53.ARecord(this, 'PublicWebsiteARecord', {
      zone: props.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Outputs
    new cdk.CfnOutput(this, 'PublicWebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 bucket name for Manor public website',
      exportName: 'ManorPublicWebsiteBucketName',
    });

    new cdk.CfnOutput(this, 'PublicWebsiteCloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for Manor public website',
      exportName: 'ManorPublicWebsiteCloudFrontDistributionId',
    });

    new cdk.CfnOutput(this, 'PublicWebsiteCloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name for Manor public website',
      exportName: 'ManorPublicWebsiteCloudFrontDomainName',
    });

    new cdk.CfnOutput(this, 'PublicWebsiteUrl', {
      value: `https://${props.domainName}`,
      description: 'Manor public website URL',
      exportName: 'ManorPublicWebsiteUrl',
    });

    // Deploy website content from the built React app
    // Skip deployment if explicitly requested (for CI/CD pipelines)
    if (!props.skipWebsiteDeployment) {
      const websiteBuildPath = props.websiteBuildPath || '../public-website/dist';
      
      const websiteDeployment = new s3deploy.BucketDeployment(this, 'PublicWebsiteDeployment', {
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
      new cdk.CfnOutput(this, 'PublicWebsiteDeploymentComplete', {
        value: 'Public website deployed successfully',
        description: 'Confirms public website content deployment',
      });
    } else {
      // Output info about skipped deployment
      new cdk.CfnOutput(this, 'PublicWebsiteDeploymentSkipped', {
        value: 'Public website deployment skipped - handle separately',
        description: 'Public website content deployment was skipped',
      });
    }
  }
}
