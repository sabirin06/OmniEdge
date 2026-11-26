# Account security operations

New accounts are provisioned by an authorized administrator. The address is validated and checked case-insensitively for duplicates. An account stays inactive until its owner enters the verification code. Existing accounts retain their prior trust and access state. Administrators can correct pending enrollment addresses. Verified addresses cannot be reassigned in user administration, which prevents email changes from replacing the account owner.

## Email delivery

Set EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, and DEFAULT_FROM_EMAIL in the backend environment. Use the verified sender address your mail provider permits. Production uses SMTP submission with TLS. Keep credentials outside Git. Development also uses SMTP once configured. The application never displays email codes in responses or terminal logs.

From backend, run the migrations and start the worker in a separate terminal:

```powershell
python manage.py migrate
python manage.py send_account_mail --watch
```

On Linux install and enable [the mail worker service](../deploy/omniedge-account-mail.service) next to the existing OmniEdge service:

```sh
sudo install -m 0644 deploy/omniedge-account-mail.service /etc/systemd/system/omniedge-account-mail.service
sudo systemctl daemon-reload
sudo systemctl enable --now omniedge-account-mail
sudo journalctl -u omniedge-account-mail
```

Requests queue email in PostgreSQL. The worker retries delivery with backoff and removes expired items. An SMTP acceptance does not guarantee delivery to the inbox. If the worker is stopped or SMTP is unavailable, restore delivery and request a fresh code. Verification and password recovery codes expire in 15 minutes, allow five guesses per issued code, and are single use. Public responses do not disclose whether an account exists. A password reset queues a notification and revokes existing sessions.

## Sign-in and authorization

- New passwords require 8 to 128 characters and pass Django's common-password, numeric and similarity checks. Existing passwords continue working until changed.
- Users can enable authenticator-app MFA in Settings and save the single-use recovery codes shown once at enrollment. Neither a password reset nor email verification disables MFA. The setup secret and queued messages are encrypted using key material derived from Django's SECRET_KEY. Plan key rotation with account recovery and outbox handling.
- Django sessions rotate on sign-in. Idle expiry is 30 minutes, absolute expiry is eight hours, and Sign out everywhere invalidates account sessions. Production enables secure cookies and HTTPS. The stock Django Admin sign-in cannot bypass the application sign-in flow.
- Rate limits are stored in PostgreSQL and apply per account and client address. Set ACCOUNT_TRUST_PROXY_IP=true only behind the configured Nginx proxy that overwrites X-Forwarded-For and denies direct upstream access.
- Authorization review covered tenant CRUD, monitoring and ingestion, incidents and evidence, reports, role assignments, platform endpoints, and read-only support routes. The role regression tests cover representative direct API access and cross-tenant attempts. The audit log tracks sign-in, recovery, MFA, session and support events. This source review and local regression run are not an independent penetration test.

## Design references

- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) informed minimum length, throttling, single-use authenticator codes, and the separation of email recovery from MFA.
- [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) and [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) informed generic recovery responses, code expiry and session invalidation.
- [Microsoft Sentinel roles](https://learn.microsoft.com/en-us/azure/sentinel/roles) and [AWS Security Hub administrator and member actions](https://docs.aws.amazon.com/securityhub/latest/userguide/securityhub-accounts-allowed-actions.html) informed scope boundaries and least privilege. Authenticator-app MFA remains optional and is not phishing-resistant.
