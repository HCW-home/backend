# Health Care Worker @Home

Simple & Secure remote consultations

### Feature

* Voice & Video consultations
* Secure Chat
* Invite patient in seconds by SMS or Email
* Send attachment or image
* PDF reporting
* Connect to external solution (OpenEMR)
* Invite guess and translator
* External authentication (SAML, JWT, Active Directory)

### Links

* [Official Website](https://hcw-at-home.com/)
* [HUG page about the solution](https://www.hug.ch/medecine-premier-recours/hughome)

### Licensing

Health Care Worker is provided under GPLv3.

### Credit

Health Care Worker @Home is supported by:

* [Fondation privée des HUG](https://www.fondationhug.org/)
* [Iabsis SARL](https://www.iabsis.com)

### Installation

HCW@Home is provided as source code only but also as Redhat/Rocky or Ubuntu/Debian package now available on our public repositories. If you need this access, please contact us. This setup install all packages on one same server while it's possible to distribute all components across various servers, required to support thousand of users in same time.

#### Requirements

Those are requirements of few users all on one server.

#### Ubuntu/Debian

The first step is to ensure your server is in your prefered timezone. Despitate HCW@Home tries to display times with your current timezone (e.g. by using your browser timezone), there are case where time is send based on server timezone (e.g an SMS with scheduled consultation). To reconfigure timezone on your local server, use the following command.

~~~
dpkg-reconfigure tzdata
~~~


HCW@Home relies on third party repository as there is no mongo or nodejs into official repositories.

~~~
apt -y install curl gnupg ca-certificates lsb-release

# NodeJS Repository
NAME=nodejs
VERSION=12
KEY_URL="https://deb.nodesource.com/gpgkey/nodesource.gpg.key"
APT_URL="deb https://deb.nodesource.com/node_${VERSION}.x $(lsb_release -sc) main"
PACKAGE=nodejs

curl -s ${KEY_URL} | apt-key add -
echo ${APT_URL} > /etc/apt/sources.list.d/${NAME}.list
apt update
apt install ${PACKAGE}

# MongoDB Repository
NAME=mongodb
VERSION=4.4
KEY_URL="https://www.mongodb.org/static/pgp/server-${VERSION}.asc"
APT_URL="deb http://repo.mongodb.org/apt/debian $(lsb_release -sc)/mongodb-org/${VERSION} main"
PACKAGE=mongodb-org

curl -s ${KEY_URL} | apt-key add -
echo ${APT_URL} > /etc/apt/sources.list.d/${NAME}.list
apt update
apt install ${PACKAGE}
~~~

Now install HCW@Home repositories official repositories.

~~~
cat > /tmp/test << EOF
deb [trusted=yes] https://projects.iabsis.com/repository/hcw-backend/debian focal main
deb [trusted=yes] https://projects.iabsis.com/repository/mediasoup-api/debian bionic main
deb [trusted=yes] https://projects.iabsis.com/repository/hcw-patient/debian focal main
deb [trusted=yes] https://projects.iabsis.com/repository/hcw-doctor/debian focal main
EOF
~~~

All packages can now be installed in one command.

~~~
apt install \
  hcw-athome-patient \
  hcw-athome-backend \
  hcw-athome-caregiver \
  nginx \
  python3-certbot-nginx \
  mongodb-server \
  postfix \
  clamav-daemon \
  redis-server \
  mediasoup-api \
  coturn
~~~

By default, HCW@Home doesn't install Nginx configuration. You can use the ready configuration from doc folder.
Once in place, you have to adjust them, especially the domain part that must fit with your environment.

~~~
cp /usr/share/doc/hcw-athome-backend/nginx-samples/hcw-athome-patient.conf /etc/nginx/sites-enabled/
cp /usr/share/doc/hcw-athome-backend/nginx-samples/hcw-athome-doctor.conf /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
~~~

We strongly suggest to add rate limits, avoiding anybody to flood the server with requests. A basic of 10 requests per second should fit any requests.

~~~
echo "limit_req_zone $http_x_forwarded_for zone=mylimit:10m rate=10r/s;" >> /etc/nginx/sites-enabled/hcw-athome-doctor.conf
echo "proxy_headers_hash_bucket_size 128;" >> /etc/nginx/sites-enabled/hcw-athome-doctor.conf
~~~

Mediasoup-API is not provided with Nginx configuration sample. You can create the file `/etc/nginx/sites-enabled/mediasoup.conf` and put the following content. Again, don't forgot to adjust the <domain> part with your custom sub domain name.

~~~
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    server_name <domain>;

    location / {
        proxy_set_header Host $host;
        proxy_pass https://localhost:3443;
        proxy_set_header X-Forwarded-For $remote_addr;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Port $server_port;

        proxy_connect_timeout 120m;
        proxy_send_timeout 120m;
        proxy_read_timeout 120m;
    }

    listen 80;
}
~~~

Once nginx configuration is ready, you can choose to put a reverse proxy in front of this installation, or install certificates with the following command. Install the certificate for the three domains required by HCW@Home.

~~~
certbot --nginx
~~~

Replace some vars into `/etc/mediasoup-api/mediasoup-api.conf` to have is working properly behind a reverse proxy.

~~~
sed -i 's|HTTP_ONLY=false|HTTP_ONLY=true|g' /etc/mediasoup-api/mediasoup-api.conf
sed -i 's|;LISTEN=3443|LISTEN=3443|g' /etc/mediasoup-api/mediasoup-api.conf
~~~

Service user must be added to clamav group, so HCW@Home can you the socket file for making file check.
Also adjust the path to this socket file into HCW@Home configuration.

~~~
adduser hcwhome clamav
sed -i 's|/var/run/clamd.scan/clamd.sock|/var/run/clamav/clamd.ctl|g' /etc/hcw-athome/hcw-athome.conf
~~~

Coturn configuration is required to allow relay. It's recommended to install several coturn servers, but having coturn on same server than HCW@Home is also supported. It's also recommended to have two public IP addresses to get full coturn capabilities.

The first step is to define pair of credential in addition of a realm of your choice.

~~~
turnadmin -k -u <user> -r <domain> -p <pass>
~~~

This returns a chain that will be put into `/etc/turnserver.conf` configuration file. Make other adjustements according to the following configuration.

~~~
# Enable only if your server is behind a NAT.
external-ip=<you machine ip>
# Adjust only if you want to use another port.
listening-port=3478 
fingerprint
lt-cred-mech
max-port=65535
min-port=49152

 # This should be the same than the one used during turnadmin command.
realm=<domain>

# user=<user>:<chain return by turnadmin> by example
user=myuser:0xab...
~~~

Now adjust the config file of Mediasoup. Adjustment is currently done under `/usr/share/mediasoup-api/config/config.js`. Be careful to keep a copy of this file somewhere as it might be overrided during mediasoup-api package upgrade.

~~~
        // backupTurnServers : [
        //      {
        //              urls : [
        //                      'turn:<domain>:3478?transport=udp'
        //              ],
        //              username   : '<user>',
        //              credential : '<pass>'
        //      }
        // ],
~~~

Now declare the mediasoup servers into mongo. You can add as many as you want, HCW@Home will pickup one randomly one, check if there is no more session than expected the use it.

~~~
mongo
use hcw-athome
db.mediasoupserver.insertOne({url:'https://<mediasoup domain>', username:'<user>', password:'<pass>',maxNumberOfSessions:10})
~~~

Now declare the translation organisations, if none just use

~~~
mongo
use hcw-at-home
db.translationorganization.insertOne({ "name" : "Default", "mainEmail" : "", "languages" : [ "fr" ], "canRefuse" : true, "createdAt" : 1645793656770, "updatedAt" : 1645793656770, "reportEmail" : "" })
~~~

We now can enable and start all services.

~~~
systemctl restart coturn
systemctl enable --now mediasoup-api
systemctl enable --now clamav-daemon
systemctl enable --now mongodb
systemctl enable --now hcw-athome
~~~

#### Redhat/Centos/Rocky

~~~

~~~

### FAQ

#### I heard about HUG@Home, is it different from HCW@Home?

HUG@Home is the same product than HCW@Home. HUG@Home name is licensed by HUG and cannot be used as Open Source product.

#### I need commercial support, do you provide this service?

Definitely yes, because this product is provided freely at your own risk, you might consider [contacting us](mailto:info@iabsis.com) to ask for a commercial support of HCW@Home.
