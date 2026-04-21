import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import type { Schema } from 'hast-util-sanitize';
import type { Plugin, PluggableList } from 'unified';
import type { Root, RootContent } from 'mdast';

type AttrList = NonNullable<Schema['attributes']>[string];

function cloneAttrs(list: AttrList | undefined): AttrList {
  return list ? [...list] : [];
}

const ALLOWED_TAGS = new Set((defaultSchema.tagNames ?? []).map((t) => t.toLowerCase()));
// Stripped entirely (element + children) by rehype-sanitize downstream.
const STRIP_TAGS = new Set(['script', 'style']);

function leadingTagName(html: string): string | null {
  const match = html.match(/^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
  return match ? match[1].toLowerCase() : null;
}

// Converts mdast `html` nodes whose tag is neither allowlisted nor force-stripped
// into plain `text` nodes carrying the original source. Reason: `rehype-sanitize`'s
// default behavior for a disallowed element is to drop the element and keep only
// its text children — which silently deletes user content like `<iso>` or
// `List<string>` (REQ-00018 AC1/AC2). Operating at the mdast layer means the
// literal `<` and `>` characters reach the renderer as text and React never sees
// an unknown element. Allowlisted HTML and `<script>`/`<style>` (later stripped
// with their children) flow through untouched.
const escapeDisallowedHtml: Plugin<[], Root> = () => (tree: Root) => {
  const walk = (parent: { children: (RootContent | { type: string; value: string })[] }) => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i];
      if (node.type === 'html' && 'value' in node && typeof node.value === 'string') {
        const tag = leadingTagName(node.value);
        if (tag && !STRIP_TAGS.has(tag) && !ALLOWED_TAGS.has(tag)) {
          parent.children[i] = { type: 'text', value: node.value };
          continue;
        }
      }
      if ('children' in node && Array.isArray(node.children)) walk(node as { children: RootContent[] });
    }
  };
  walk(tree);
};

export const markdownSanitizeSchema: Schema = {
  ...defaultSchema,
  // Remove these elements *together with their children* — not just the wrapper.
  // `defaultSchema.strip` ships only with `script`; without adding `style`,
  // `hast-util-sanitize` drops the `<style>` element but keeps its CSS text
  // children, which leaks `body{color:red}`-style text into the rendered DOM
  // (REQ-00018 AC4).
  strip: [...(defaultSchema.strip ?? []), 'style'],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    code: [
      ...cloneAttrs(defaultSchema.attributes?.code),
      ['className', /^language-./, /^code-.*$/, 'hljs'],
    ],
    pre: [
      ...cloneAttrs(defaultSchema.attributes?.pre),
      ['className', /^language-./, /^code-.*$/, 'hljs'],
    ],
    span: [
      ...cloneAttrs(defaultSchema.attributes?.span),
      ['className', /^token/, /^code-line/, /^line-/, 'highlight-line'],
    ],
    img: [
      ...cloneAttrs(defaultSchema.attributes?.img),
      'alt',
      'title',
    ],
  },
  protocols: {
    ...(defaultSchema.protocols ?? {}),
    src: [...(defaultSchema.protocols?.src ?? []), 'data'],
  },
};

// Comment-render pipeline: no rehype-raw (raw HTML passthrough is not allowed on
// the comment path), and remark-breaks so that legacy comments authored under
// `whitespace-pre-wrap` keep their single-newline line breaks. The same
// disallowed-HTML escape pass runs here so that bare `<iso>`-style tokens in
// comments render as literal text instead of being silently stripped.
export const commentRemarkPlugins: PluggableList = [escapeDisallowedHtml, remarkBreaks];
export const commentRehypePlugins: PluggableList = [[rehypeSanitize, markdownSanitizeSchema]];
