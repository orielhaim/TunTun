import { auth } from "../auth";
import {
  clearEntitlementsCache,
  getEntitlements,
  hasAnyUsers,
} from "./entitlements";

export async function ensureBootstrapUser(): Promise<void> {
  const entitlements = await getEntitlements();
  if (entitlements.tier === "cloud") {
    return;
  }

  if (await hasAnyUsers()) {
    return;
  }

  const email = process.env.TUNNET_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.TUNNET_BOOTSTRAP_PASSWORD?.trim();
  const name = process.env.TUNNET_BOOTSTRAP_NAME?.trim() || "Admin";

  if (!email || !password) {
    console.error(
      "[bootstrap] Set TUNNET_BOOTSTRAP_EMAIL and TUNNET_BOOTSTRAP_PASSWORD to seed the owner.",
    );
    return;
  }

  if (password.length < 8) {
    console.error(
      "[bootstrap] TUNNET_BOOTSTRAP_PASSWORD must be at least 8 characters",
    );
    return;
  }

  await auth.api.createUser({
    body: {
      email,
      password,
      name,
      role: "admin",
    },
  });

  clearEntitlementsCache();
  console.log(`[bootstrap] Seeded owner account ${email} (admin)`);
}
