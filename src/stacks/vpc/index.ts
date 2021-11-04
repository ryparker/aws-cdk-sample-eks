import { Construct, Stack, CfnOutput } from '@aws-cdk/core';
import { LogGroup } from "@aws-cdk/aws-logs";
import {
  Vpc,
  SubnetType,
  Port,
  SecurityGroup,
  InterfaceVpcEndpointAwsService,
  GatewayVpcEndpointAwsService,
  FlowLogDestination,
  FlowLogTrafficType
} from '@aws-cdk/aws-ec2';

export default (scope: Construct) => {
  const stack = new Stack(scope, 'Vpc');

  const cloudWatchLogs = new LogGroup(stack, 'Log');

  const vpc = new Vpc(stack, 'VpcResource', {
    maxAzs: 2,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    subnetConfiguration: [
      {
        name: 'private',
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      {
        name: 'public',
        subnetType: SubnetType.PUBLIC,
      },
    ],
    gatewayEndpoints: {
      S3: {
        service: GatewayVpcEndpointAwsService.S3,
      },
    },
    flowLogs: {
      s3: {
        destination: FlowLogDestination.toCloudWatchLogs(cloudWatchLogs),
        trafficType: FlowLogTrafficType.ALL,
      }
    }
  }
  );

  // Security group used to connect the EKS cluster with the proxy instance.
  const clusterSecurityGroup = new SecurityGroup(stack, 'ClusterHandlerSecurityGroup', {
    vpc,
    allowAllOutbound: false,
    description: 'Security group for the cluster handler',
  });
  // Allow all connections between Security Group resources.
  clusterSecurityGroup.addEgressRule(clusterSecurityGroup, Port.allTraffic());
  clusterSecurityGroup.addIngressRule(clusterSecurityGroup, Port.allTraffic());

  /* VPC endpoints */
  const lambdaEndpoint = vpc.addInterfaceEndpoint('LambdaVpcEndpoint', {
    service: InterfaceVpcEndpointAwsService.LAMBDA,
    securityGroups: [clusterSecurityGroup],
  })
  lambdaEndpoint.connections.allowDefaultPortFromAnyIpv4();

  const cloudformationEndpoint = vpc.addInterfaceEndpoint('CloudFormationVpcEndpoint', {
    service: InterfaceVpcEndpointAwsService.CLOUDFORMATION,
    securityGroups: [clusterSecurityGroup],
  })
  cloudformationEndpoint.connections.allowDefaultPortFromAnyIpv4();

  const stepFunctionsEndpoint = vpc.addInterfaceEndpoint('StepFunctionsVpcEndpoint', {
    service: InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
    securityGroups: [clusterSecurityGroup],
  })
  stepFunctionsEndpoint.connections.allowDefaultPortFromAnyIpv4();

  const stsEndpoint = vpc.addInterfaceEndpoint('StsVpcEndpoint', {
    service: InterfaceVpcEndpointAwsService.STS,
    securityGroups: [clusterSecurityGroup],
  })
  stsEndpoint.connections.allowDefaultPortFromAnyIpv4();

  /* Stack Outputs */
  new CfnOutput(stack, 'VpcFlowLogs', { value: cloudWatchLogs.logGroupArn });
  new CfnOutput(stack, 'PublicSubnets', { value: vpc.publicSubnets.join(', ') });
  new CfnOutput(stack, 'IsolatedSubnets', { value: vpc.isolatedSubnets.join(', ') });
  new CfnOutput(stack, 'PrivateSubnets', { value: vpc.privateSubnets.join(', ') });

  return {
    stack,
    vpc,
    clusterSecurityGroup
  }
}
