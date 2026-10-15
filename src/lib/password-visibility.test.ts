import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AuthScreen from "@/app/components/AuthScreen";
import { createPasswordFieldState, passwordInputType, togglePasswordVisibility } from "./password-visibility";

test("registration password fields start hidden and toggles preserve their values", () => {
  const initial = createPasswordFieldState();
  assert.equal(initial.visible, false);
  assert.equal(passwordInputType(initial.visible), "password");

  const entered = { value: "MiClave123456", visible: false };
  const shown = togglePasswordVisibility(entered);
  assert.equal(passwordInputType(shown.visible), "text");
  assert.equal(shown.value, entered.value);

  const hidden = togglePasswordVisibility(shown);
  assert.equal(passwordInputType(hidden.visible), "password");
  assert.equal(hidden.value, entered.value);
});

test("registration visibility controls are buttons and expose accessible names", () => {
  const markup = renderToStaticMarkup(createElement(AuthScreen, { mode: "register" }));
  assert.equal((markup.match(/type="password"/g) || []).length, 2);
  assert.equal((markup.match(/type="button"/g) || []).length, 2);
  assert.match(markup, /aria-label="Mostrar contraseña"/);
  assert.match(markup, /aria-label="Mostrar confirmación de contraseña"/);
});
