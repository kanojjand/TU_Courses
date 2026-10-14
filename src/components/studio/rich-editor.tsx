'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code2, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Простой редактор текста урока: заголовки, списки, ссылки, код. Сохраняет сам. */
export function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } })],
    content: value,
    editorProps: {
      attributes: { class: 'prose-lesson min-h-40 px-4 py-3 focus:outline-none', 'aria-label': placeholder ?? 'text' },
    },
    onUpdate: ({ editor }) => changeRef.current(editor.getHTML()),
  });
  useEffect(() => () => editor?.destroy(), [editor]);
  if (!editor) return <div className="min-h-40 rounded-lg border border-border bg-surface" />;
  const Btn = ({ on, label, active, children }: { on: () => void; label: string; active?: boolean; children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={on}
      aria-label={label}
      title={label}
      className={cn('inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg', active && 'bg-surface-2 text-fg')}
    >
      {children}
    </button>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface focus-within:border-brand">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-surface-2/50 p-1">
        <Btn label="Bold" on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>
          <Bold className="size-4" />
        </Btn>
        <Btn label="Italic" on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}>
          <Italic className="size-4" />
        </Btn>
        <Btn label="H2" on={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>
          <Heading2 className="size-4" />
        </Btn>
        <Btn label="H3" on={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>
          <Heading3 className="size-4" />
        </Btn>
        <Btn label="List" on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>
          <List className="size-4" />
        </Btn>
        <Btn label="Ordered list" on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>
          <ListOrdered className="size-4" />
        </Btn>
        <Btn label="Quote" on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>
          <Quote className="size-4" />
        </Btn>
        <Btn label="Code" on={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}>
          <Code2 className="size-4" />
        </Btn>
        <Btn
          label="Link"
          on={() => {
            const prev = editor.getAttributes('link').href as string | undefined;
            const url = window.prompt('URL', prev ?? 'https://');
            if (url === null) return;
            if (url === '') editor.chain().focus().unsetLink().run();
            else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
          active={editor.isActive('link')}
        >
          <Link2 className="size-4" />
        </Btn>
        <span className="mx-1 w-px bg-border" />
        <Btn label="Undo" on={() => editor.chain().focus().undo().run()}>
          <Undo2 className="size-4" />
        </Btn>
        <Btn label="Redo" on={() => editor.chain().focus().redo().run()}>
          <Redo2 className="size-4" />
        </Btn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
