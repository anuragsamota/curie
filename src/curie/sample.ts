import type { CurieDocument, CurieManifest } from "./types";

export const sampleManifest: CurieManifest = {
  format: "curie",
  formatVersion: "0.1.0",
  id: "org.curie.sample.functions",
  title: "A first look at functions",
  description: "A short interactive-style lesson about how functions map inputs to outputs.",
  author: "Curie",
  entry: "document.json",
  assetsDirectory: "assets/",
  requiredFeatures: ["markdown", "math", "image", "video", "graph", "lottie", "quiz", "slider", "reveal", "flashcard", "callout"],
};

export const sampleDocument: CurieDocument = {
  documentVersion: 1,
  blocks: [
    {
      id: "welcome",
      type: "markdown",
      content: "# A first look at functions\n\nA function is a rule that maps each input to exactly one output. Think of it as a small machine: put a value in, apply a rule, and get a result.\n\n> **Learning goal:** connect a formula, a table of values, and a graph.",
    },
    {
      id: "formula",
      type: "markdown",
      content: "## A simple example\n\nConsider the function:\n\n$$f(x) = 2x + 1$$\n\nFor every input \\(x\\), multiply by two and add one. For example, \\(f(3)=2(3)+1=7\\).\n\nIn science, symbols help us write relationships compactly. For example, density is often written as \\(\\rho = \\frac{m}{V}\\), where \\(m\\) is mass and \\(V\\) is volume.",
    },
    {
      id: "values",
      type: "graph",
      title: "See the relationship",
      xLabel: "Input (x)",
      yLabel: "Output f(x)",
      kind: "line",
      data: [
        { x: -2, y: -3 }, { x: -1, y: -1 }, { x: 0, y: 1 },
        { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 },
      ],
    },
    {
      id: "reflection",
      type: "markdown",
      content: "## What to notice\n\n- Every input has one output.\n- The output increases by **2** whenever the input increases by 1.\n- The graph is a straight line because the rate of change is constant.\n\n### Quick check\n\nIf \\(f(x)=2x+1\\), what is \\(f(5)\\)?\n\nYou can use the graph or substitute 5 into the formula. (Answer: 11.)",
    },
    {
      id: "callout-tip",
      type: "callout",
      variant: "tip",
      title: "Try it yourself",
      content: "The slider below is interactive. Change the input and observe its value update.",
    },
    {
      id: "slider-demo",
      type: "slider",
      label: "Choose an input value",
      min: -5,
      max: 10,
      step: 1,
      initial: 3,
      unit: "units",
    },
    {
      id: "quiz-demo",
      type: "quiz",
      question: "If f(x) = 2x + 1, what is f(4)?",
      options: ["7", "8", "9", "10"],
      correctIndex: 2,
      explanation: "Substitute x = 4: f(4) = 2 × 4 + 1 = 9.",
    },
    {
      id: "reveal-demo",
      type: "reveal",
      title: "Reveal a useful hint",
      content: "For a linear function **f(x) = mx + b**, the value *m* is the slope and *b* is the y-intercept.",
    },
    {
      id: "flashcard-demo",
      type: "flashcard",
      front: "What does the slope of a straight-line graph describe?",
      back: "The rate at which y changes for each unit change in x.",
    },
    {
      id: "video",
      type: "video",
      title: "Video block example",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      caption: "A sample video block. Replace this URL with a lesson video or a path inside assets/.",
    },
  ],
};
