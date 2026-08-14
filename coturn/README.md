# coturn — STUN/TURN server for PrisonConnect WebRTC

Provides STUN/TURN so family-web browsers and prison kiosks behind NAT/firewalls
can establish WebRTC calls through the media server.

## Generate TLS certificates (self-signed is fine for LAN pilots)

```
mkdir certs
openssl req -x509 -newkey rsa:2048 -keyout certs/turn_server_pkey.pem -out certs/turn_server_cert.pem -days 365 -nodes -subj "/CN=prisonconnect.local"
```

## Set the shared auth secret

Replace `static-auth-secret` in `turnserver.conf`:

```
openssl rand -hex 32
```

Clients obtain ephemeral TURN credentials via the REST API pattern
(`use-auth-secret`), e.g. username `expiry-timestamp:user-id` and the HMAC-SHA1 of
the secret.

## Run

With Docker (root `docker-compose.yml`):

```
docker compose up -d coturn
```

Or natively:

```
docker run --rm --network host -v "$PWD/turnserver.conf:/etc/coturn/turnserver.conf" -v "$PWD/certs:/etc/coturn/certs:ro" coturn/coturn
```

## Clients

Point WebRTC clients at `turn:prisonconnect.local:3478?transport=udp` (and `tcp`),
tls at `turns:prisonconnect.local:5349`. The media server's announced IP and the
TURN server must be reachable from both ends of a call.
