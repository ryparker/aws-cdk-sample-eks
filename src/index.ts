import { App, Stack, CfnOutput } from '@aws-cdk/core';
import { Cluster, KubernetesVersion } from '@aws-cdk/aws-eks';
import { Vpc, SubnetType, Instance, InstanceType, MachineImage, Peer, Port, UserData, CloudFormationInit, InitCommand } from '@aws-cdk/aws-ec2';
import { User } from '@aws-cdk/aws-iam';
import {
  KEY_PAIR_NAME,
  SYSTEMS_MASTER_AWS_USERNAME,
  UBUNTU_AMI_REGION,
  UBUNTU_AMI_ID,
  PROXY_USERNAME,
  PROXY_PASSWORD,
  PROXY_PORT
} from './constants';

const app = new App();
const stack = new Stack(app, 'EksWithProxySample');

const vpc = new Vpc(stack, 'Vpc', {
  maxAzs: 2,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  subnetConfiguration: [
    {
      name: 'private',
      subnetType: SubnetType.PRIVATE_WITH_NAT,
    },
    {
      name: 'public',
      subnetType: SubnetType.PUBLIC,
    },
  ]
});

// Base Ubuntu image does not come with 'cfn-signal' a required AWS dependency.
const userData = UserData.forLinux()
userData.addCommands(
  'apt-get update -y',
  'apt-get install -y git awscli ec2-instance-connect',
  'until git clone https://github.com/aws-quickstart/quickstart-linux-utilities.git; do echo "Retrying"; done',
  'cd /quickstart-linux-utilities',
  'source quickstart-cfn-tools.source',
  'qs_update-os || qs_err',
  'qs_bootstrap_pip || qs_err',
  'qs_aws-cfn-bootstrap || qs_err',
  'mkdir -p /opt/aws/bin',
  'ln -s /usr/local/bin/cfn-* /opt/aws/bin/'
)

const proxyInstance = new Instance(stack, 'Proxy', {
  vpc,
  vpcSubnets: { subnetType: SubnetType.PUBLIC },
  allowAllOutbound: true,
  instanceType: new InstanceType('t2.micro'),
  machineImage: MachineImage.genericLinux({ [UBUNTU_AMI_REGION]: UBUNTU_AMI_ID }, { userData }),
  keyName: KEY_PAIR_NAME,
  init: CloudFormationInit.fromElements(
    InitCommand.shellCommand('sudo apt-get update -y'),
    InitCommand.shellCommand('sudo apt-get install -y squid apache2-utils'),
  )
});

// Allow all Ipv4 traffic to enable Lambda to connect to the proxy server.
proxyInstance.connections.allowFrom(Peer.anyIpv4(), Port.tcp(PROXY_PORT), 'Allow PROXY_PORT access to the proxy server');
proxyInstance.connections.allowFrom(Peer.anyIpv4(), Port.tcp(22), 'Allow SSH access to the proxy server');

const cluster = new Cluster(stack, 'HelloEks', {
  vpc,
  version: KubernetesVersion.V1_21,
  // Provision the 'ClusterHandler' Lambda function responsible for interacting with the EKS API in order to control the cluster lifecycle.
  placeClusterHandlerInVpc: true,
  clusterHandlerEnvironment: {
    // Set the http_proxy environment variable to the proxy server's URL.
    http_proxy: `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${proxyInstance.instancePublicIp}:${PROXY_PORT}`,
    https_proxy: `https://${PROXY_USERNAME}:${PROXY_PASSWORD}@${proxyInstance.instancePublicIp}:${PROXY_PORT}`,
    no_proxy: "sts.amazonaws.com"
  },
});

cluster.addManifest('HelloKubernetesManifest', {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'hello-kubernetes' },
  spec: {
    containers: [
      {
        name: 'hello',
        image: 'paulbouwer/hello-kubernetes:1.5',
        ports: [{ containerPort: 8080 }]
      }
    ]
  }
});

// Map an AWS user to the 'system:masters' kubeconfig group.
const awsUser = User.fromUserName(stack, 'SystemsMasterAwsUser', SYSTEMS_MASTER_AWS_USERNAME);
cluster.awsAuth.addUserMapping(awsUser, { groups: ['system:masters'] });

/* Stack outputs */
new CfnOutput(stack, 'ClusterName', { value: cluster.clusterName });
new CfnOutput(stack, 'ProxyInstancePublicIp', { value: proxyInstance.instancePublicIp });
new CfnOutput(stack, 'ProxyInstanceSshCommand', { value: `ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ubuntu@${proxyInstance.instancePublicIp}` });
new CfnOutput(stack, 'SystemsMasterUserArn', { value: awsUser.userArn });
