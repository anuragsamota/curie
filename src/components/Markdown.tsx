import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Markdown with tables and KaTeX math; links open outside the app. */
export const Markdown = memo(function Markdown({ content, className = "" }: { content: string; className?: string }) {
  return <div className={`prose max-w-none curie-prose ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}
      components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
    >{content}</ReactMarkdown>
  </div>;
});
