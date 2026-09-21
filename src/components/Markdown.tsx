import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

/**
 * Renders markdown (bold, lists, line breaks) to React elements.
 * Raw HTML in the source is never injected — safe for AI output.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 [&_a]:underline [&_h1]:text-[15px] [&_h1]:font-semibold [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_p]:leading-relaxed [&_strong]:font-semibold">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
