import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";

export class CasaDomainStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: certificatemanager.Certificate;
  public readonly wildcardCertificate: certificatemanager.Certificate;
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import the existing hosted zone
    this.hostedZone = route53.HostedZone.fromLookup(this, 'MyManorHostedZone', {
      domainName: 'mymanor.click',
    });

    // Create SSL certificate for the domain
    this.certificate = new certificatemanager.Certificate(this, 'MyManorCertificate', {
      domainName: 'mymanor.click',
      subjectAlternativeNames: ['www.mymanor.click'],
      validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
    });

    // Create wildcard certificate for subdomains
    this.wildcardCertificate = new certificatemanager.Certificate(this, 'MyManorWildcardCertificate', {
      domainName: '*.mymanor.click',
      validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
    });

    // Output the hosted zone ID and certificate ARNs for other stacks
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      exportName: 'MyManor-HostedZoneId',
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      exportName: 'MyManor-CertificateArn',
    });

    new cdk.CfnOutput(this, 'WildcardCertificateArn', {
      value: this.wildcardCertificate.certificateArn,
      exportName: 'MyManor-WildcardCertificateArn',
    });

    new cdk.CfnOutput(this, 'DomainName', {
      value: 'mymanor.click',
      exportName: 'MyManor-DomainName',
    });
  }
}
