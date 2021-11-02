import { App } from '@aws-cdk/core';
import {
  KEY_PAIR_NAME,
  SYSTEMS_MASTER_AWS_USERNAME,
  UBUNTU_AMI_REGION,
  UBUNTU_AMI_ID,
  PROXY_USERNAME,
  PROXY_PASSWORD,
  PROXY_PORT
} from './constants';

import createVpcStack from './stacks/vpc'
import createProxyInstanceStack from './stacks/proxy-instance'
import createEksClusterStack from './stacks/eks-cluster'


const app = new App();

// cdk deploy Vpc
const { vpc, clusterSecurityGroup } = createVpcStack(app);

// cdk deploy ProxyInstance
const { proxyInstance } = createProxyInstanceStack(app, {
  vpc,
  clusterSecurityGroup,
  keyPairName: KEY_PAIR_NAME,
  amiId: UBUNTU_AMI_ID,
  amiRegion: UBUNTU_AMI_REGION
});

// cdk deploy EksCluster
createEksClusterStack(app, {
  vpc,
  clusterSecurityGroup,
  proxyInstance,
  proxyUrl: `http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${proxyInstance.instancePublicIp}:${PROXY_PORT}`,
  systemsMasterAwsUser: SYSTEMS_MASTER_AWS_USERNAME
})
