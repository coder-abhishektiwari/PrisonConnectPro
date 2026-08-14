# Technical Architecture & System Design Specification

## System Components

```text
+-----------------------+     +-------------------------------+     +------------------------------+
|  Android Inmate Kiosk |     |  Family Mobile Browser (Web)  |     | Jail Admin Monitoring Console|
+-----------+-----------+     +---------------+---------------+     +--------------+---------------+
            |                                 |                                    |
            +---------------------------------+------------------------------------+
                                              |
                                   +----------v----------+
                                   | Nginx Reverse Proxy |
                                   +----------+----------+
                                              |
                     +------------------------+------------------------+
                     |                                                 |
           +---------v----------+                            +---------v----------+
           | Node.js Signaling  |                            | Mediasoup SFU      |
           | & Room Management  |                            | Media Server       |
           +---------+----------+                            +---------+----------+
                     |                                                 |
         +-----------+-----------+                             +-------+-------+
         |                       |                             |               |
+--------v-------+       +-------v-------+             +-------v-------+ +-----v-----+
| PostgreSQL DB  |       | Redis Cache   |             | FFmpeg        | | Coturn    |
| (UserData, Logs|       | (Session/OTP) |             | Recorder      | | STUN/TURN |
+----------------+       +---------------+             +-------+-------+ +-----------+
                                                               |
                                                       +-------v-------+
                                                       | MinIO Storage |
                                                       | (WORM Vault)  |
                                                       +---------------+
```

## Functional Workflows

### 1. Inmate Kiosk Flow (`android-kiosk`)
1. **Multi-Modal Login**: RFID / Fingerprint / Face ID.
2. **Dashboard**: Profile, trust bank balance, family contacts.
3. **Call Scheduling & Slot Validation**: Verify slot availability & balance.
4. **WebRTC Media Connection**: Establish encrypted DTLS-SRTP audio/video stream.
5. **Live Billing Engine**: Real-time duration countdown and minute deduction.
6. **Completion & Receipt**: Tear down WebRTC session, persist call log, print receipt.

### 2. Family Member Verification Flow (`family-web`)
1. **Secure SMS Link Dispatch**: One-time tokenized access URL.
2. **Environment & Device Fingerprinting**: Check location, browser settings, flags.
3. **WebOTP Verification**: Automated SIM-based OTP extraction.
4. **Anti-Recording Shield**: Screenshot/screen-record protection hooks.
5. **WebRTC Join**: Connect directly via browser without installing native app.

### 3. Warden Silent Monitoring & SaaS Admin (`warden-dashboard`)
1. **Silent Live Tap**: Join ongoing SFU media router feed with muted microphone.
2. **Call Control**: Force terminate or mute suspect call sessions.
3. **Trust Account Reconciliation**: Manage prisoner balances, deposits, and call tariffs.
4. **Recording Center**: Immutable WORM storage audit trail and encrypted playback.
5. **SaaS Multi-Jail Management**: Multi-tenant administration, capacity monitoring, and DLT SMS configuration.
