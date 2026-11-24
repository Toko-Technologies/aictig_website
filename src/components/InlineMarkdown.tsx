import ReactMarkdown from 'react-markdown';

interface InlineMarkdownProps {
  children: string;
}

/**
 * Renders a short Markdown string inline (no wrapping <p>), allowing only
 * links, emphasis and bold. Used for bios and citation lists.
 */
export default function InlineMarkdown({ children }: InlineMarkdownProps) {
  return (
    <ReactMarkdown
      allowedElements={['p', 'a', 'em', 'strong']}
      unwrapDisallowed
      components={{
        p: ({ children: inner }) => <>{inner}</>,
        strong: ({ children: inner }) => (
          <strong className="font-semibold text-neutral-900">{inner}</strong>
        ),
        a: ({ href, children: inner }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 underline decoration-primary-200 underline-offset-2 hover:text-primary-700 hover:decoration-primary-600 transition-colors focus-ring rounded-sm"
          >
            {inner}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
