import { describe, it, expect, beforeEach } from "vitest";

import { getRotatedModels, resetComboRotation } from "../../open-sse/services/combo.js";

describe("combo round-robin routing", () => {
  beforeEach(() => {
    resetComboRotation();
  });

  it("keeps existing one-request round-robin behavior by default", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from({ length: 4 }, () => (
      getRotatedModels(models, "combo-user-a", "round-robin")[0]
    ));

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-b",
      "provider/model-a",
      "provider/model-b",
    ]);
  });

  it("sticks to each combo model for the configured number of requests", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from({ length: 6 }, () => (
      getRotatedModels(models, "combo-user-a", "round-robin", 2)[0]
    ));

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-a",
      "provider/model-b",
      "provider/model-b",
      "provider/model-a",
      "provider/model-a",
    ]);
  });

  it("tracks sticky rotation independently per combo", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "combo-user-a", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "combo-user-b", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "combo-user-a", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "combo-user-a", "round-robin", 2)[0]).toBe("provider/model-b");
    expect(getRotatedModels(models, "combo-user-b", "round-robin", 2)[0]).toBe("provider/model-a");
  });

  it("isolates rotations for same-named combos owned by different users", () => {
    const modelsA = ["provider/model-a", "provider/model-b"];
    const modelsB = ["provider/model-c", "provider/model-d"];

    expect(getRotatedModels(modelsA, "combo-id-user-a-fast", "round-robin")[0]).toBe("provider/model-a");
    expect(getRotatedModels(modelsB, "combo-id-user-b-fast", "round-robin")[0]).toBe("provider/model-c");
    expect(getRotatedModels(modelsA, "combo-id-user-a-fast", "round-robin")[0]).toBe("provider/model-b");
    expect(getRotatedModels(modelsB, "combo-id-user-b-fast", "round-robin")[0]).toBe("provider/model-d");
  });

  it("does not rotate fallback combos", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "combo-user-a", "fallback", 2)).toEqual(models);
    expect(getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
  });
});
