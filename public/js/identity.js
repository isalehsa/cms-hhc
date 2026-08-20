// الهوية المؤسسية — الدخول الموحّد (SSO عبر OIDC/SAML) والتحقق بخطوتين (MFA / TOTP)
// يعتمد على Firebase Identity Platform؛ يُهيَّأ المزوّد وتُفعَّل MFA من لوحة Firebase،
// ويُحدَّد معرّف المزوّد في firebase-config.js (ssoConfig.providerId).
import {
  getAuth, OAuthProvider, SAMLAuthProvider, signInWithPopup,
  getMultiFactorResolver, multiFactor, TotpMultiFactorGenerator,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { app } from "./db.js";
import { ssoConfig } from "./firebase-config.js";

const auth = app ? getAuth(app) : null;

export const hasSSO = () => Boolean(ssoConfig?.providerId);
export const ssoLabel = () => ssoConfig?.label || "الدخول الموحّد (SSO)";

// بناء مزوّد الدخول الموحّد وفق بادئة المعرّف
function ssoProvider() {
  const id = ssoConfig.providerId;
  return id.startsWith("saml.") ? new SAMLAuthProvider(id) : new OAuthProvider(id);
}

// الدخول عبر SSO — قد يرمي auth/multi-factor-auth-required فيُعالَج بمُحلِّل MFA
export function loginWithSSO() {
  return signInWithPopup(auth, ssoProvider());
}

// ---------- التحقق بخطوتين عند الدخول ----------
export const isMfaError = (err) => err?.code === "auth/multi-factor-auth-required";
export const getMfaResolver = (err) => getMultiFactorResolver(auth, err);

// إكمال الدخول برمز TOTP من تطبيق المصادقة
export async function completeTotpSignIn(resolver, otp) {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || resolver.hints[0];
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, otp);
  return resolver.resolveSignIn(assertion);
}

// ---------- تسجيل عامل TOTP للمستخدم الحالي ----------
export function enrolledFactors() {
  return auth?.currentUser ? multiFactor(auth.currentUser).enrolledFactors : [];
}

// بدء التسجيل: يعيد السر ورابط otpauth للإدخال في تطبيق المصادقة
export async function startTotpEnrollment(accountName, issuer = "CMS — إدارة الالتزام") {
  const user = auth.currentUser;
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return {
    secret,
    secretKey: secret.secretKey,
    uri: secret.generateQrCodeUrl(accountName || user.email || "user", issuer),
  };
}

// إتمام التسجيل بالتحقق من رمز TOTP
export async function finishTotpEnrollment(secret, otp, displayName = "تطبيق المصادقة") {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, otp);
  await multiFactor(auth.currentUser).enroll(assertion, displayName);
}

export async function unenrollFactor(factorUid) {
  await multiFactor(auth.currentUser).unenroll(factorUid);
}
