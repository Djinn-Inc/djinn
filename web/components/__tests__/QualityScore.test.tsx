import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import QualityScore from "../QualityScore";

describe("QualityScore", () => {
  it("renders the score value with + prefix for positive scores", () => {
    const { container } = render(<QualityScore score={7} />);
    const text = container.textContent ?? "";
    expect(text).toContain("+");
    expect(text).toContain("7");
    expect(text).toContain("QS");
  });

  it("renders QS label", () => {
    render(<QualityScore score={3} />);
    expect(screen.getByText("QS")).toBeInTheDocument();
  });

  describe("positive scores", () => {
    it("renders high positive score (> 5) with green-600 styling", () => {
      const { container } = render(<QualityScore score={8} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-600");
      expect(wrapper.className).toContain("bg-green-100");
    });

    it("renders low positive score (0 < score <= 5) with green-500 styling", () => {
      const { container } = render(<QualityScore score={3} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-500");
      expect(wrapper.className).toContain("bg-green-50");
    });

    it("shows + sign for positive scores", () => {
      const { container } = render(<QualityScore score={10} />);
      expect(container.textContent).toContain("+");
      expect(container.textContent).toContain("10");
    });
  });

  describe("negative scores", () => {
    it("renders mildly negative score (-5 < score < 0) with genius-500 styling", () => {
      const { container } = render(<QualityScore score={-3} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-genius-500");
      expect(wrapper.className).toContain("bg-orange-50");
    });

    it("renders very negative score (<= -5) with red styling", () => {
      const { container } = render(<QualityScore score={-8} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-red-600");
      expect(wrapper.className).toContain("bg-red-100");
    });

    it("renders exactly -5 with red styling", () => {
      const { container } = render(<QualityScore score={-5} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-red-600");
    });

    it("does not show + sign for negative scores", () => {
      const { container } = render(<QualityScore score={-3} />);
      // The text content should have "QS" then the number without + prefix
      const text = container.textContent ?? "";
      // There should be no "+" in the output
      expect(text).not.toMatch(/\+/);
      expect(text).toContain("-3");
    });
  });

  describe("zero score", () => {
    it("renders zero with slate styling", () => {
      const { container } = render(<QualityScore score={0} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-slate-500");
      expect(wrapper.className).toContain("bg-slate-100");
    });

    it("does not show + sign for zero", () => {
      const { container } = render(<QualityScore score={0} />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\+/);
      expect(text).toContain("0");
    });
  });

  describe("size variants", () => {
    it("uses md size by default", () => {
      const { container } = render(<QualityScore score={5} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-2xl");
      expect(wrapper.className).toContain("px-4");
      expect(wrapper.className).toContain("py-2");
    });

    it("uses sm size when specified", () => {
      const { container } = render(<QualityScore score={5} size="sm" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-lg");
      expect(wrapper.className).toContain("px-3");
      expect(wrapper.className).toContain("py-1");
    });

    it("uses lg size when specified", () => {
      const { container } = render(<QualityScore score={5} size="lg" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-4xl");
      expect(wrapper.className).toContain("px-6");
      expect(wrapper.className).toContain("py-3");
    });
  });

  describe("boundary values", () => {
    it("renders score of exactly 5 with green-500 (not green-600)", () => {
      const { container } = render(<QualityScore score={5} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-500");
    });

    it("renders score of 6 with green-600", () => {
      const { container } = render(<QualityScore score={6} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-600");
    });

    it("renders score of -4 with genius-500 styling", () => {
      const { container } = render(<QualityScore score={-4} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-genius-500");
    });
  });
});
