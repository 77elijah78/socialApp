# Message push integration — backend handoff

Frontend base: `a2fd1876ac332a452f232e3202d28faf95bc2624`.
Inspected backend: `902e191d807e83d47cba2e66831e024b04db9921`.

At that pin, there is **no push-token API, device-token table, push preference API,
conversation mute API, or Expo/FCM sender**. The user chose to have the backend
session add this support while the independent frontend work proceeds. This is
not a claim that any endpoint below already exists; no endpoint names are invented.

Please publish the actual route/DTO/source contract when implemented:

- Authenticated idempotent Expo token registration/update and revocation. Tokens
  must be installation-owned, safely transferred between accounts, and revocable
  on logout/permission loss. State how token rotation and reinstall are handled.
- Authenticated notification enable/disable and per-conversation mute APIs, with
  defaults and authoritative reads. Recheck these preferences and active group
  membership at send time, not only when queuing the push.
- Exact push `data` schema: stable message ID, conversation ID, target account ID,
  and a message-specific discriminator/version. The client will adapt to the real
  field names; it will never navigate arbitrary push-provided URLs or trust a
  pushed receiver/group label over active-membership REST metadata.
- Server-generated title/body with safe text/photo/video/voice/document/shared
  previews. The foreground client uses canonical persisted messages and real
  sender/participant metadata rather than fabricating a second message store.
- Android channel ID: **`messages-v1`**. Importance HIGH, default sound, private
  lockscreen visibility. Expo Push tokens use the existing EAS project ID
  `fa49de58-e64b-450a-9401-1f29da85af02` and Android package `com.elijah77.social`.
- Durable message-driven push sending independent of Socket.IO connectivity.
  Do not use socket presence as proof the user is reading a conversation. Exclude
  the sender; deduplicate message/recipient/installation jobs; handle Expo tickets,
  receipts, invalid tokens and retryable provider errors honestly.

Foreground OS alerts are suppressed in favor of one global in-app banner.
Background/terminated notifications must be **native notification messages**, not
socket-triggered local notifications or a JS background task assumption.

The client already has authenticated `GET /api/v1/messages/conversations` and
`GET /api/v1/messages/conversations/:id/messages`. The inspected backend has no
single-conversation GET route. Active-membership verification on tap reuses the
actual list, including group/private identity and real participant names.

No backend source changes, migrations, merge, deployment, FCM service-account
credential handling, or live push tests are performed from this frontend session.
Do not send service-account keys or Expo/GitHub access tokens through chat.
