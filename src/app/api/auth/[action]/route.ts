import { z } from "zod";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { currentUser, login, register, registerSchema, requestPasswordReset, resetPassword, revokeSession, updatePassword, verifyEmail } from "@/lib/auth";
import { errorResponse, hashToken, normalizedEmail, rateLimit, randomToken, sameOrigin } from "@/lib/security";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const emailSchema = z.object({ email: z.email() });
const passwordSchema = z.object({ password: z.string().min(12).max(128) });
const registerWithConfirmation = registerSchema.extend({ confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });
const resetWithConfirmation = passwordSchema.extend({ token: z.string(), confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });
const changeWithConfirmation = passwordSchema.extend({ currentPassword: z.string(), confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { message: "Las contraseñas no coinciden", path: ["confirmPassword"] });

export async function POST(request: Request, context: RouteContext<"/api/auth/[action]">) {
  const { action } = await context.params;
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  if (!Number(request.headers.get("content-length") || 0) || Number(request.headers.get("content-length")) > 4096) return errorResponse("Solicitud inválida", 400);
  try {
    const input: unknown = await request.json();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!(await rateLimit(`auth:${action}:${ip}`, action === "login" ? 12 : 5, 15))) return errorResponse("Demasiados intentos. Probá más tarde", 429);
    const baseUrl = new URL(request.url).origin;

    if (action === "register") {
      const data = registerWithConfirmation.parse(input);
      await db()`DELETE FROM pending_users WHERE expires_at < now()`;
      if (!(await rateLimit(`register:${normalizedEmail(data.email)}`, 3, 60))) return errorResponse("Probá más tarde", 429);
      await register(data, baseUrl);
      return Response.json({ message: "Si corresponde, recibirás un enlace de verificación. Si ya tenés un registro pendiente, usá Reenviar verificación" });
    }
    if (action === "verify") {
      const { token } = z.object({ token: z.string() }).parse(input);
      if (!(await verifyEmail(token))) return errorResponse("Enlace inválido o expirado", 400);
      return Response.json({ message: "Email verificado. Ya podés iniciar sesión" });
    }
    if (action === "resend") {
      const { email } = emailSchema.parse(input);
      if (!(await rateLimit(`resend:${normalizedEmail(email)}`, 3, 60))) return errorResponse("Probá más tarde", 429);
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Proveedor de email no configurado");
      const pending = await db()`SELECT email FROM pending_users WHERE email = ${normalizedEmail(email)} AND expires_at > now()`;
      if (pending.length) {
        const token = randomToken();
        await db()`UPDATE pending_users SET token_hash = ${hashToken(token)}, expires_at = now() + interval '24 hours' WHERE email = ${normalizedEmail(email)}`;
        await sendEmail(normalizedEmail(email), "Verificá tu email - L’Italia Barber", `Confirmá tu cuenta: ${baseUrl}/verificar?token=${token}`);
      }
      return Response.json({ message: "Si tu cuenta está pendiente, te enviamos otro enlace" });
    }
    if (action === "login") {
      const { email, password } = emailSchema.extend({ password: z.string() }).parse(input);
      if (!(await rateLimit(`login:${normalizedEmail(email)}`, 12, 15))) return errorResponse("Demasiados intentos. Probá más tarde", 429);
      const role = await login(email, password);
      if (!role) return errorResponse("Credenciales inválidas o email sin verificar", 401);
      return Response.json({ role });
    }
    if (action === "logout") {
      await revokeSession();
      return Response.json({ message: "Sesión cerrada" });
    }
    if (action === "forgot") {
      const { email } = emailSchema.parse(input);
      if (!(await rateLimit(`forgot:${normalizedEmail(email)}`, 3, 60))) return errorResponse("Probá más tarde", 429);
      await requestPasswordReset(email, baseUrl);
      return Response.json({ message: "Si existe una cuenta, te enviamos un enlace" });
    }
    if (action === "reset") {
      const { token, password } = resetWithConfirmation.parse(input);
      if (!(await resetPassword(token, password))) return errorResponse("Enlace inválido o expirado", 400);
      return Response.json({ message: "Contraseña actualizada. Iniciá sesión nuevamente" });
    }
    if (action === "change-password") {
      const user = await currentUser();
      if (!user) return errorResponse("Sesión expirada", 401);
      const { currentPassword, password } = changeWithConfirmation.parse(input);
      const rows = await db()`SELECT password_hash FROM users WHERE id = ${user.id}`;
      if (!(await argon2.verify(rows[0].password_hash, currentPassword))) return errorResponse("Contraseña actual incorrecta", 400);
      await updatePassword(user.id, password);
      return Response.json({ message: "Contraseña actualizada. Iniciá sesión nuevamente" });
    }
    return errorResponse("Acción desconocida", 404);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues.some((issue) => issue.message === "Las contraseñas no coinciden") ? "Las contraseñas no coinciden" : "Datos inválidos", 400);
    if (error instanceof SyntaxError) return errorResponse("Datos inválidos", 400);
    if (error instanceof Error && error.message === "Proveedor de email no configurado") {
      return errorResponse("El envío de emails no está disponible en este momento", 503);
    }
    console.error("Auth error", error);
    return errorResponse("No pudimos completar la operación. Intentá más tarde", 503);
  }
}