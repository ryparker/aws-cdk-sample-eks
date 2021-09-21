import { App, Stack } from '@aws-cdk/core';
import { Cluster, KubernetesVersion } from '@aws-cdk/aws-eks';

const app = new App();
const stack = new Stack(app, 'sample-eks');


// provisiong a cluster
const cluster = new Cluster(stack, 'hello-eks', {
  version: KubernetesVersion.V1_21,
  placeClusterHandlerInVpc: true, // Provision the 'ClusterHandler' Lambda function responsible for interacting with the EKS API in order to control the cluster lifecycle
  clusterHandlerEnvironment: {
    http_proxy: 'http://localhost:8080', // Set the http_proxy environment variable to the proxy server's URL
  }
});

// apply a kubernetes manifest to the cluster
cluster.addManifest('mypod', {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: { name: 'mypod' },
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
