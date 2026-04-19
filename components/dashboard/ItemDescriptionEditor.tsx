'use client';

import {
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertCodeBlock,
  InsertThematicBreak,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  codeBlockPlugin,
  codeMirrorPlugin,
  diffSourcePlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
} from '@mdxeditor/editor';

import '@mdxeditor/editor/style.css';

interface Props {
  markdown: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabelledBy?: string;
}

export default function ItemDescriptionEditor({
  markdown,
  onChange,
  readOnly,
  placeholder,
  ariaLabelledBy,
}: Props) {
  return (
    <div
      role="group"
      aria-labelledby={ariaLabelledBy}
      className="item-detail-md-editor"
    >
      <MDXEditor
        markdown={markdown}
        onChange={(md) => onChange(md ?? '')}
        readOnly={readOnly}
        placeholder={placeholder}
        contentEditableClassName="item-detail-md-editor__content"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              txt: 'Plain text',
              ts: 'TypeScript',
              tsx: 'TSX',
              js: 'JavaScript',
              jsx: 'JSX',
              json: 'JSON',
              css: 'CSS',
              html: 'HTML',
              bash: 'Shell',
              md: 'Markdown',
              yaml: 'YAML',
              py: 'Python',
            },
          }),
          markdownShortcutPlugin(),
          diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: markdown }),
          toolbarPlugin({
            toolbarContents: () => (
              <DiffSourceToggleWrapper>
                <UndoRedo />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertCodeBlock />
                <InsertThematicBreak />
              </DiffSourceToggleWrapper>
            ),
          }),
        ]}
      />
    </div>
  );
}
