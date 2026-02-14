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
    it("renders high positive score (> 5) with green-400 styling", () => {
      const { container } = render(<QualityScore score={8} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-400");
      expect(wrapper.className).toContain("bg-green-500/10");
    });

    it("renders low positive score (0 < score <= 5) with green-300 styling", () => {
      const { container } = render(<QualityScore score={3} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-300");
      expect(wrapper.className).toContain("bg-green-500/5");
    });

    it("shows + sign for positive scores", () => {
      const { container } = render(<QualityScore score={10} />);
      expect(container.textContent).toContain("+");
      expect(container.textContent).toContain("10");
    });
  });

  describe("negative scores", () => {
    it("renders mildly negative score (-5 < score < 0) with orange styling", () => {
      const { container } = render(<QualityScore score={-3} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-orange-400");
      expect(wrapper.className).toContain("bg-orange-500/10");
    });

    it("renders very negative score (<= -5) with red styling", () => {
      const { container } = render(<QualityScore score={-8} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-red-400");
      expect(wrapper.className).toContain("bg-red-500/10");
    });

    it("renders exactly -5 with red styling", () => {
      const { container } = render(<QualityScore score={-5} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-red-400");
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
    it("renders zero with gray styling", () => {
      const { container } = render(<QualityScore score={0} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-gray-400");
      expect(wrapper.className).toContain("bg-gray-500/10");
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
    it("renders score of exactly 5 with green-300 (not green-400)", () => {
      const { container } = render(<QualityScore score={5} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-300");
    });

    it("renders score of 6 with green-400", () => {
      const { container } = render(<QualityScore score={6} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-green-400");
    });

    it("renders score of -4 with orange styling", () => {
      const { container } = render(<QualityScore score={-4} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain("text-orange-400");
    });
  });
});
