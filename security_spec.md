# SafeReach Firestore Security Specification

## 1. Data Invariants
1. **Zero Phone Number Collection (Privacy First)**: SafeReach does not collect, store, or transmit user or emergency phone numbers anywhere in Firestore.
2. **10-Character Complex Unique ID**: Every newly registered account receives a randomly generated, exact 10-character Unique ID containing uppercase letters (`A-Z`), lowercase letters (`a-z`), numbers (`0-9`), and special symbols (`!@#$%^&*-_+=~`).
3. **Admin-Controlled Access & Subscriptions (`udayphanindravamsikoyya@gmail.com`)**: Only an authenticated, email-verified session matching `udayphanindravamsikoyya@gmail.com` holds `isAdmin()` authority to grant or remove subscriptions (`subscriptionStatus: 'active' | 'revoked'`, `accessGranted: true | false`), modify profile names/roles, and manage user access by Unique ID.
4. **No Self-Granted Subscriptions**: Non-admin users can only create profiles with `subscriptionStatus: 'pending'` and `accessGranted: false`, and can never modify subscription or admin fields.
5. **Subscription-Gated Operations**: Active telemetry updates, trip creation, sending family access requests, and family safety alerts require `hasActiveSubscription(userId)` (either Admin or `accessGranted == true && subscriptionStatus == 'active'`).
6. **Consent-Gated Family Linking & No Public Location Exposure**: `/users/{accountId}/live/current` and `/trips/{tripId}` are strictly unreadable to strangers; only owner, admin, or an explicitly `approved` `/familyAccess/{accountId}_{familyOwnerUid}` contact (when traveler is actively subscribed) can read live coordinates.
7. **PII & Auth Isolation**: Email stays in `/users/{accountId}/private/info` (`ownerUid == request.auth.uid`); `/history/{entryId}` is owner-only. Standard Email/Password or Google sign-ups authenticate via `isSignedIn()` (generating their 10-char Unique ID immediately, still subscription-gated by Admin), while `isAdmin()` strictly requires `email_verified == true` to prevent admin email spoofing.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Location Read**: Anonymous client reads `/users/u1/live/current` -> `PERMISSION_DENIED`.
2. **Non-Admin Self-Subscription Escalation**: Non-admin user creates `/users/u2` with `subscriptionStatus: "active", accessGranted: true` -> `PERMISSION_DENIED`.
3. **Non-Admin Subscription Tampering on Update**: Non-admin user updates `/users/u2` to set `accessGranted: true` -> `PERMISSION_DENIED`.
4. **Email-Unverified Admin Spoofing**: Session claiming `email: "udayphanindravamsikoyya@gmail.com"` with `email_verified: false` tries to list `/users` or grant subscription -> `PERMISSION_DENIED`.
5. **Unsubscribed Telemetry & Tracking Attempt**: Pending/revoked non-admin user tries to create `/users/u2/trips/t1` or `/familyLinks/u1_u2` -> `PERMISSION_DENIED`.
6. **Weak or Malformed Unique ID Injection**: User creates `/directory/12345` or `/users/u2` with a weak `safeReachId` missing special characters/case/length -> `PERMISSION_DENIED`.
7. **Stranger Location Snooping via Unique ID**: Authenticated stranger reads `/users/u1/live/current` without approved `familyAccess` -> `PERMISSION_DENIED`.
8. **Family Member Self-Approval**: Tracker `u2` updates `/familyLinks/u1_u2` to `status: "approved"` -> `PERMISSION_DENIED`.
9. **Directory Scraping (`list`)**: Non-admin or any client queries `collection(db, 'directory')` -> `PERMISSION_DENIED`.
10. **Cross-Owner Users Listing**: Non-admin queries `collection(db, 'users')` without `where('ownerUid', '==', request.auth.uid)` -> `PERMISSION_DENIED`.
11. **Shadow Ghost Field Injection (Phone Number / Admin Claim)**: Client creates `/users/u2/private/info` with extra `phone: "+91..."` or `/users/u2` with `isAdmin: true` -> `PERMISSION_DENIED`.
12. **Fake Client Timestamp Spoofing**: Client writes `/users/u2` or `/live/current` with `updatedAt` != `request.time` -> `PERMISSION_DENIED`.
