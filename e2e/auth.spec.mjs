import { test, expect } from "@playwright/test";

test.describe("Auth critical paths", () => {
  test("sends a signed-out visitor from /launch to login, defaulting next to the dashboard", async ({
    page,
  }) => {
    await page.goto("/launch");

    // /launch is a splash route, not a protected one, so it is not a valid
    // "next" target: getSafeProtectedNextRoute rejects any path outside
    // PROTECTED_ROUTES. A signed-out visitor therefore falls back to the
    // dashboard rather than being sent back through the animation.
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard&reason=auth_required/);
    // The login heading is APP_COPY.loginHeading ("Welcome back"), not "Sign in".
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("preserves requested protected path in next param", async ({ page }) => {
    await page.goto("/dashboard?tab=volume");

    await expect(page).toHaveURL(
      /\/login\?next=%2Fdashboard%3Ftab%3Dvolume&reason=auth_required/
    );
  });

  test("login page routes users to signup and forgot-password", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: /create one here/i }).click();
    await expect(page).toHaveURL(/\/signup$/);

    await page.goto("/login");
    await page.getByRole("link", { name: /reset with otp/i }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("signup shows deterministic client-side validation errors", async ({ page }) => {
    await page.goto("/signup");

    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText("Please enter your first and last name.")).toBeVisible();

    await page.getByLabel("First name", { exact: true }).fill("Anuj");
    await page.getByLabel("Last name", { exact: true }).fill("Sharma");
    // exact: true — "Confirm email" also contains "Email", and a loose match
    // resolves to both inputs.
    await page.getByLabel("Email", { exact: true }).fill("anuj@example.com");
    await page.getByLabel("Confirm email", { exact: true }).fill("other@example.com");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText("Email and confirm email do not match.")).toBeVisible();

    await page.getByLabel("Confirm email", { exact: true }).fill("anuj@example.com");
    await page.getByLabel("Password", { exact: true }).fill("StrongPass1!");
    await page.getByLabel("Confirm password", { exact: true }).fill("StrongPass2!");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText("Password and confirm password do not match.")).toBeVisible();
  });

  test("forgot-password validates email before sending OTP", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.getByRole("button", { name: /send otp/i }).click();
    await expect(page.getByText("Please enter your email.")).toBeVisible();
  });
});
