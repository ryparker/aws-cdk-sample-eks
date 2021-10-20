import { App, Stack } from 'monocdk';
import { Cluster, KubernetesVersion } from 'monocdk/aws-eks';
import { Vpc, SubnetType, Instance, InstanceType, MachineImage, Peer, Port, UserData, CloudFormationInit, InitCommand } from 'monocdk/aws-ec2';
import { User } from 'monocdk/aws-iam';
// import { App, Stack } from '@aws-cdk/core';
// import { Cluster, KubernetesVersion } from '@aws-cdk/aws-eks';
// import { Vpc, SubnetType, Instance, InstanceType, MachineImage, Peer, Port, UserData, CloudFormationInit, InitCommand } from '@aws-cdk/aws-ec2';
// import { User } from '@aws-cdk/aws-iam';

const KEY_PAIR_NAME = 'eks-sample-proxy';
const PROXY_USERNAME = 'user1';
const PROXY_PASSWORD = 'user1';
const ADMIN_USERNAME = 'Admin';

const app = new App();
const stack = new Stack(app, 'eks-with-fix');

const vpc = new Vpc(stack, 'vpc', {
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

// Base Ubuntu image does not come with 'cfn-signal' a required AWS dependency
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

const proxyInstance = new Instance(stack, 'proxy', {
  instanceType: new InstanceType('t2.micro'),
  machineImage: MachineImage.genericLinux({
    'us-east-1': 'ami-09e67e426f25ce0d7' // Ubuntu v20.04 LTS x86
  }, {
    userData
  }),
  vpc,
  vpcSubnets: { subnetType: SubnetType.PUBLIC },
  allowAllOutbound: true,
  keyName: KEY_PAIR_NAME,
  init: CloudFormationInit.fromElements(
    // Tools
    InitCommand.shellCommand('sudo apt-get update -y'),
    InitCommand.shellCommand('sudo apt-get install -y squid apache2-utils'),
    InitCommand.shellCommand('OLD="http_access\sdeny\sall";NEW="http_access allow all";sudo sed -i.old "s/$OLD/$NEW/" /etc/squid/squid.conf'),
  )
});

proxyInstance.connections.allowFromAnyIpv4(Port.allTraffic(), 'Allow all traffic');

/**
 * Configure the proxy server (manually)
 *
 * 1. `$ ssh -i ~/.ssh/eks-sample-proxy.pem ubuntu@<public-dns-name>`
 * 2. `$ sudo su`
 * 5. `$ nano /etc/squid/squid.conf`
 *  - Replace 'http_access deny all' with 'http_access allow all'
 *  - add the following to top of file:
```
acl blocked_websites dstdomain "/etc/squid/blocked_sites.acl"
http_access deny blocked_websites
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
auth_param basic children 5
auth_param basic realm Squid Basic Authentication
auth_param basic credentialsttl 2 hours
acl auth_users proxy_auth REQUIRED
http_access allow auth_users
```
 * 6. `$ touch /etc/squid/passwd`
 * 7. `$ htpasswd /etc/squid/passwd user1`
 * 8. provide a password when prompted
 * 9. `$ nano /etc/squid/blocked_sites.acl`
 * 10. Add websites to block to the blocked_sites file e.g. '.google.com'
 * 11. `$ systemctl restart squid`
 * 12. `$ tail -f /var/log/squid/access.log`
 */


const cluster = new Cluster(stack, 'hello-eks', {
  version: KubernetesVersion.V1_21,
  // endpointAccess: EndpointAccess.PRIVATE, // No access outside of your VPC.
  placeClusterHandlerInVpc: true, // Provision the 'ClusterHandler' Lambda function responsible for interacting with the EKS API in order to control the cluster lifecycle
  clusterHandlerEnvironment: {
    http_proxy: `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${proxyInstance.instancePublicIp}:3128`, // Set the http_proxy environment variable to the proxy server's URL
  },
  vpc,
});

cluster.connections.allowTo(proxyInstance, Port.tcp(80), 'Allow HTTP traffic to the proxy server');
cluster.connections.allowFrom(Peer.anyIpv4(), Port.tcp(22), 'Allow SSH access to the cluster server');

cluster.addManifest('hello-kubernetes-manifest', {
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

const adminUser = User.fromUserName(stack, 'Admin', ADMIN_USERNAME);
cluster.awsAuth.addUserMapping(adminUser, { groups: ['system:masters'] });

// Deploy times
// 1st test: 45m
// 2nd test: 37m

// Delete times
// 1st test: 10m
// 2nd test: 13m
