import { Construct, Stack, CfnOutput } from '@aws-cdk/core';
import { Cluster, KubernetesVersion } from '@aws-cdk/aws-eks';
import {
  Vpc,
  SubnetType,
  SecurityGroup,
  Instance,
} from '@aws-cdk/aws-ec2';
import { User } from '@aws-cdk/aws-iam';

export default (scope: Construct, props: {
  vpc: Vpc,
  clusterSecurityGroup: SecurityGroup,
  proxyInstance: Instance,
  proxyUrl: string,
  systemsMasterAwsUser: string,
}) => {
  const stack = new Stack(scope, 'EksCluster');

  // Add Proxy instance to security group so that Cluster can access it.
  props.proxyInstance.addSecurityGroup(props.clusterSecurityGroup);

  const cluster = new Cluster(stack, 'HelloEks', {
    vpc: props.vpc,
    vpcSubnets: [{ subnetType: SubnetType.PRIVATE_ISOLATED }],
    version: KubernetesVersion.V1_21,
    securityGroup: props.clusterSecurityGroup,
    placeClusterHandlerInVpc: true,
    clusterHandlerSecurityGroup: props.clusterSecurityGroup,
    clusterHandlerEnvironment: {
      // Set the https_proxy environment variable to the proxy server's URL.
      https_proxy: props.proxyUrl,
    },
    kubectlEnvironment: {
      https_proxy: props.proxyUrl,
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
  const awsUser = User.fromUserName(stack, 'SystemsMasterAwsUser', props.systemsMasterAwsUser);
  cluster.awsAuth.addUserMapping(awsUser, { groups: ['system:masters'] });

  /* Stack Outputs */
  new CfnOutput(stack, 'ClusterName', { value: cluster.clusterName });
  new CfnOutput(stack, 'SystemsMasterUserArn', { value: awsUser.userArn });

  return {
    stack,
    cluster,
    awsUser
  }
}
