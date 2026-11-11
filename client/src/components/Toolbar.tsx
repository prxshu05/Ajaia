import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';

type Block = 'p' | 'h1' | 'h2' | 'h3';

function Btn(props: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const title = props.shortcut ? `${props.label} (${props.shortcut})` : props.label;
  return (
    <button
      type="button"
      className={props.active ? 'tb-btn active' : 'tb-btn'}
      title={title}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      // keep focus (and the selection) in the editor
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 1 }) ? 'h1'
        : e.isActive('heading', { level: 2 }) ? 'h2'
        : e.isActive('heading', { level: 3 }) ? 'h3' : 'p') as Block,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  function setBlock(b: Block) {
    if (b === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(b[1]) as 1 | 2 | 3 }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()}>↶</Btn>
      <Btn label="Redo" shortcut={`${mod}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()}>↷</Btn>
      <span className="tb-sep" />
      <select className="tb-select" aria-label="Text style" value={s.block} onChange={(e) => setBlock(e.target.value as Block)}>
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="tb-sep" />
      <Btn label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn label="Strikethrough" shortcut={`${mod}Shift+S`} active={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <span className="tb-sep" />
      <Btn label="Bulleted list" shortcut={`${mod}Shift+8`} active={s.bullet} onClick={() => chain().toggleBulletList().run()}>• List</Btn>
      <Btn label="Numbered list" shortcut={`${mod}Shift+7`} active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1. List</Btn>
      <Btn label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
      <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>⌫ Clear</Btn>
    </div>
  );
}
