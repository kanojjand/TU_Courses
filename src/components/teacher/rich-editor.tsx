'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useEffect } from 'react';
import {
  Bold, Code, Heading2, Heading3, Italic, List, ListOrdered, Quote, Redo, Table2, Undo,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * F-T-05. Редактор текстовых лекций: форматирование, таблицы, изображения,
 * вставка кода. Формулы вводятся как код TeX и отображаются моноширинно
 * (полноценный рендеринг формул — этап 2).
 */
export function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose-lesson min-h-72 max-w-none px-4 py-3 focus:outline-none',
        'aria-label': placeholder ?? 'Текст лекции',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value, false);
    // Синхронизация только при внешней смене значения
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) {
    return <div className="min-h-72 rounded-lg border border-border bg-muted/40" />;
  }

  const buttons = [
    { icon: Bold, label: 'Полужирный', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
    { icon: Italic, label: 'Курсив', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
    { icon: Heading2, label: 'Заголовок 2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
    { icon: Heading3, label: 'Заголовок 3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }) },
    { icon: List, label: 'Маркированный список', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
    { icon: ListOrdered, label: 'Нумерованный список', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
    { icon: Quote, label: 'Цитата', action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote') },
    { icon: Code, label: 'Код', action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock') },
    { icon: Table2, label: 'Таблица', action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: editor.isActive('table') },
    { icon: Undo, label: 'Отменить', action: () => editor.chain().focus().undo().run(), active: false },
    { icon: Redo, label: 'Повторить', action: () => editor.chain().focus().redo().run(), active: false },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="scroll-x flex gap-0.5 border-b border-border bg-muted/50 p-1">
        {buttons.map(({ icon: Icon, label, action, active }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={action}
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors',
              active ? 'bg-brand text-brand-fg' : 'text-fg-muted hover:bg-border hover:text-fg'
            )}
          >
            <Icon size={15} aria-hidden />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
