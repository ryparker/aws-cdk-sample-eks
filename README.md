# aws-cdk-sample-eks

An EKS cluster that uses a Squid proxy for the onEvent lambda's requests.

## :rocket: Quick Start

**1. Setup a key pair**

[Create a key pair](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html#having-ec2-create-your-key-pair) with the name `eks-with-proxy-sample` in your AWS account.

*If you already have a key pair configured, change the `KEY_PAIR_NAME` variable within `src/constants.ts` to match your key pair name.*

**2. Install dependencies with Yarn v1**

```sh
yarn install
```

**3. Create the [bootstrap stack](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html) in your AWS account**
_This only needs to be ran once per account/region._

```sh
yarn bootstrap
```

**4. Build Cloudformation files**

```sh
yarn build
```

**5. Deploy**

```sh
yarn deploy
```

**6. Setup a proxy server on the EC2 instance**

Setup the proxy server you'd like to use to proxy the EKS cluster's onEvent lambda requests.

*See "[Setup the EC2 instance with Squid Proxy](#setup-the-ec2-instance-with-squid-proxy)" for an example setup.*

## :satellite: Setup the EC2 instance with Squid Proxy

*Squid should already be installed on the EC2 instance.*

**1. SSH into the EC2 instance**

  ```sh
  ssh -i ~/.ssh/eks-with-proxy-sample.pem ubuntu@<public-dns-name>
  ```

**2. Access elevated privilages**

  ```sh
  sudo su
  ```

**3. Edit Squid configuration**

  ```sh
  nano /etc/squid/squid.conf
  ```

   - Replace `http_access deny all` with `http_access allow all`
   - Add the following to the top of the file:

      ```sh
      # Authentication configuration
      auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwd
      auth_param basic children 5
      auth_param basic realm Squid Basic Authentication
      auth_param basic credentialsttl 2 hours
      acl auth_users proxy_auth REQUIRED
      http_access allow auth_users
      ```

**4. Create password for proxy user**

  ```sh
  touch /etc/squid/passwd
  htpasswd /etc/squid/passwd user1
  # Provide a password when prompted
  ```

**5. Restart Squid**

  ```sh
  systemctl restart squid
  ```

**6. Tail the proxy logs to watch request traffic**

  ```sh
  tail -f /var/log/squid/access.log
  ```
