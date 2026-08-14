/**
 * Client-side validation utilities for auth forms.
 */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate an email address.
 */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address';
  return null;
}

/**
 * Validate a password.
 */
export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return null;
}

/**
 * Validate a strong password (for registration).
 */
export function validateStrongPassword(password: string): string | null {
  const baseError = validatePassword(password);
  if (baseError) return baseError;

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null;
}

/**
 * Validate a name.
 */
export function validateName(name: string): string | null {
  if (!name.trim()) return 'Full name is required';
  if (name.trim().length < 2) return 'Name must be at least 2 characters';
  return null;
}

/**
 * Validate a confirm password field.
 */
export function validateConfirmPassword(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) return 'Please confirm your password';
  if (password !== confirmPassword) return 'Passwords do not match';
  return null;
}

/**
 * Validate login form.
 */
export function validateLogin(email: string, password: string): ValidationResult {
  const errors: Record<string, string> = {};
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);

  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate register form.
 */
export function validateRegister(
  name: string,
  email: string,
  password: string,
  confirmPassword: string
): ValidationResult {
  const errors: Record<string, string> = {};
  const nameError = validateName(name);
  const emailError = validateEmail(email);
  const passwordError = validateStrongPassword(password);
  const confirmError = validateConfirmPassword(password, confirmPassword);

  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  if (confirmError) errors.confirmPassword = confirmError;

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate forgot password form.
 */
export function validateForgotPassword(email: string): ValidationResult {
  const errors: Record<string, string> = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validate reset password form.
 */
export function validateResetPassword(
  newPassword: string,
  confirmPassword: string
): ValidationResult {
  const errors: Record<string, string> = {};
  const passwordError = validateStrongPassword(newPassword);
  const confirmError = validateConfirmPassword(newPassword, confirmPassword);

  if (passwordError) errors.newPassword = passwordError;
  if (confirmError) errors.confirmPassword = confirmError;

  return { valid: Object.keys(errors).length === 0, errors };
}