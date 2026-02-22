import { test, expect } from "@playwright/test";

test.describe("Auth critical paths", () => {
  test("redirects unauthenticated users from protected routes to /login", async ({ page }) => {
    await page.goto("/launch");

    await expect(page).toHaveURL(/\/login\?next=%2Flaunch&reason=auth_required/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
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

    await page.getByLabel("First name").fill("Anuj");
    await page.getByLabel("Last name").fill("Sharma");
    await page.getByLabel("Email").fill("anuj@example.com");
    await page.getByLabel("Confirm email").fill("other@example.com");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText("Email and confirm email do not match.")).toBeVisible();

    await page.getByLabel("Confirm email").fill("anuj@example.com");
    await page.getByLabel("Password").fill("StrongPass1!");
    await page.getByLabel("Confirm password").fill("StrongPass2!");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page.getByText("Password and confirm password do not match.")).toBeVisible();
  });

  test("forgot-password validates email before sending OTP", async ({ page }) => {
    await page.goto("/forgot-password");

    await page.getByRole("button", { name: /send otp/i }).click();
    await expect(page.getByText("Please enter your email.")).toBeVisible();
  });
});
