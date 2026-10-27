# Password Policy

Credential passwords must contain at least 8 Unicode code points and no more
than 72 UTF-8 bytes. The upper bound matches bcrypt's effective input limit.
Signup, password change, and password reset enforce the same policy; login
rejects credentials longer than the bound instead of letting bcrypt silently
compare only their first 72 bytes.

## Existing accounts

Passwords created before this policy may have exceeded 72 UTF-8 bytes. A bcrypt
hash cannot reveal whether the original password was longer than 72 bytes, so
those accounts cannot be identified or migrated automatically. Their full
over-limit password will now be rejected at login; the user must use the
password-reset flow to choose a compliant password. An existing password whose
input was already within the 72-byte bcrypt limit continues to work. No hashes
are rewritten by this policy change.
