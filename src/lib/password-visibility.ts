export type PasswordFieldState = { value: string; visible: boolean };

export function createPasswordFieldState(): PasswordFieldState {
  return { value: "", visible: false };
}

export function passwordInputType(visible: boolean): "password" | "text" {
  return visible ? "text" : "password";
}

export function togglePasswordVisibility(field: PasswordFieldState): PasswordFieldState {
  return { ...field, visible: !field.visible };
}
