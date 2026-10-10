export const MIN_PASSWORD_CHARACTERS = 8;
export const MAX_PASSWORD_BYTES = 72;

export function passwordValidationError(password: string): string | null {
  if (Array.from(password).length < MIN_PASSWORD_CHARACTERS) {
    return `Password must be at least ${MIN_PASSWORD_CHARACTERS} characters`;
  }

  if (new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES) {
    return `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes`;
  }

  return null;
}

export function exceedsBcryptPasswordLimit(password: string): boolean {
  return new TextEncoder().encode(password).byteLength > MAX_PASSWORD_BYTES;
}
