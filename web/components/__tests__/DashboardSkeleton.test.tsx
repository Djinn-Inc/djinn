import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DashboardSkeleton from "../DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it("contains pulse animation class", () => {
    const { container } = render(<DashboardSkeleton />);
    const animatedEl = container.querySelector(".animate-pulse");
    expect(animatedEl).toBeTruthy();
  });

  it("renders three placeholder cards", () => {
    const { container } = render(<DashboardSkeleton />);
    const cards = container.querySelectorAll(".h-24");
    expect(cards.length).toBe(3);
  });
});
