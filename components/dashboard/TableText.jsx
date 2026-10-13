// Wrap labels after two words without truncating their values.
export default function TableText({ children }) {
  const text = String(children ?? '');
  return (
    <span className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">
      {(text.match(/\S+(?:[^\S\n]+\S+)?/g) || []).join('\n')}
    </span>
  );
}
