import { Construct, Stack, CfnOutput } from '@aws-cdk/core';
import {
  Vpc,
  SubnetType,
  Instance,
  InstanceType,
  MachineImage,
  Peer,
  Port,
  UserData,
  CloudFormationInit,
  InitCommand,
} from '@aws-cdk/aws-ec2';

export default (scope: Construct, props: {
  keyPairName: string,
  amiRegion: string,
  amiId: string,
  vpc: Vpc,
}) => {
  const stack = new Stack(scope, 'ProxyInstance');

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
    vpc: props.vpc,
    vpcSubnets: { subnetType: SubnetType.PUBLIC },
    allowAllOutbound: true,
    instanceType: new InstanceType('t2.micro'),
    machineImage: MachineImage.genericLinux({ [props.amiRegion]: props.amiId }, { userData }),
    keyName: props.keyPairName,
    init: CloudFormationInit.fromElements(
      InitCommand.shellCommand('sudo apt-get update -y'),
      InitCommand.shellCommand('sudo apt-get install -y squid apache2-utils'),
    ),
  });
  proxyInstance.connections.allowFrom(Peer.anyIpv4(), Port.tcp(22), 'Allow SSH access to the proxy server');

  /* Stack Outputs */
  new CfnOutput(stack, 'ProxyInstancePublicIp', { value: proxyInstance.instancePublicIp });
  new CfnOutput(stack, 'ProxyInstancePrivateIp', { value: proxyInstance.instancePrivateIp });
  new CfnOutput(stack, 'ProxyInstanceSshCommand', { value: `ssh -i ~/.ssh/${props.keyPairName}.pem ubuntu@${proxyInstance.instancePublicIp}` });

  return { stack, proxyInstance };
}
