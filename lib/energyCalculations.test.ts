import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MULTIPLIERS,
  calculateBmi,
  calculateAgeYearsFromBirthDate,
  calculateBmrMifflinStJeor,
  calculateMaintenanceCalories,
  calculateMaintenanceCaloriesFromProfile,
  calculateNetCalories,
  calculateTotalBurnCalories,
  getBmiCategory,
} from "@/lib/energyCalculations";

describe("energy calculation formulas", () => {
  it("uses Mifflin-St Jeor for male", () => {
    const bmr = calculateBmrMifflinStJeor({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
    });

    expect(bmr).toBeCloseTo(1780, 5);
  });

  it("uses Mifflin-St Jeor for female", () => {
    const bmr = calculateBmrMifflinStJeor({
      sex: "female",
      weightKg: 60,
      heightCm: 165,
      ageYears: 28,
    });

    expect(bmr).toBeCloseTo(1330.25, 5);
  });

  it("computes maintenance from activity multiplier", () => {
    const maintenance = calculateMaintenanceCalories({
      bmr: 1700,
      activityLevel: "moderate",
    });

    expect(ACTIVITY_MULTIPLIERS.moderate).toBe(1.55);
    expect(maintenance).toBeCloseTo(2635, 5);
  });

  it("computes age from birth date", () => {
    const age = calculateAgeYearsFromBirthDate("2000-03-01", new Date("2026-02-28T12:00:00Z"));
    expect(age).toBe(25);
  });

  it("returns null age for invalid or future birth date", () => {
    expect(calculateAgeYearsFromBirthDate("not-a-date")).toBeNull();
    expect(calculateAgeYearsFromBirthDate("2100-01-01", new Date("2026-02-28T12:00:00Z"))).toBeNull();
  });

  it("computes profile-based maintenance with age + bmr + multiplier", () => {
    const maintenance = calculateMaintenanceCaloriesFromProfile({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      birthDateIso: "1996-02-20",
      activityLevel: "light",
      referenceDate: new Date("2026-02-28T12:00:00Z"),
    });

    expect(maintenance).toBeCloseTo(2447.5, 4);
  });

  it("computes BMI from weight_kg and height_cm", () => {
    const bmi = calculateBmi(80, 180);
    expect(bmi).toBeCloseTo(24.6914, 4);
  });

  it("returns null BMI for invalid weight/height", () => {
    expect(calculateBmi(0, 180)).toBeNull();
    expect(calculateBmi(80, 0)).toBeNull();
    expect(calculateBmi(-10, 175)).toBeNull();
  });

  it("maps BMI categories with the expected thresholds", () => {
    expect(getBmiCategory(18.4)).toBe("underweight");
    expect(getBmiCategory(18.5)).toBe("normal");
    expect(getBmiCategory(24.9)).toBe("normal");
    expect(getBmiCategory(25.0)).toBe("overweight");
    expect(getBmiCategory(29.9)).toBe("overweight");
    expect(getBmiCategory(30.0)).toBe("obese");
  });

  it("computes total burn from maintenance + active", () => {
    expect(calculateTotalBurnCalories(2200, 450)).toBe(2650);
    expect(calculateTotalBurnCalories(null, 450)).toBeNull();
    expect(calculateTotalBurnCalories(2200, null)).toBeNull();
  });

  it("computes net calories from intake - total burn", () => {
    expect(calculateNetCalories(2500, 2300)).toBe(200);
    expect(calculateNetCalories(1800, 2200)).toBe(-400);
    expect(calculateNetCalories(null, 2200)).toBeNull();
    expect(calculateNetCalories(1800, null)).toBeNull();
  });
});
