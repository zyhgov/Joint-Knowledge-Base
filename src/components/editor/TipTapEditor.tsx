import React, { useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Collaboration from '@tiptap/extension-collaboration'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Typography from '@tiptap/extension-typography'
import * as Y from 'yjs'
import { yCursorPlugin } from '@tiptap/y-tiptap'
import { common, createLowlight } from 'lowlight'
import type { CollabUser } from './CollabProvider'
import type { Editor } from '@tiptap/react'
import type { WebsocketProvider } from 'y-websocket'
import { r2Service } from '@/services/r2Service'
import toast from 'react-hot-toast'
import SlashCommand from './SlashCommand'
import html2pdf from 'html2pdf.js'
import { saveAs } from 'file-saver'

const lowlight = createLowlight(common)

// 自定义 Image 扩展：支持上传
const ImageWithUpload = Image.configure({
  HTMLAttributes: {
    class: 'editor-image',
  },
  inline: false,
  allowBase64: true,
})

interface TipTapEditorProps {
  doc: Y.Doc
  provider: WebsocketProvider
  users: CollabUser[]
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  onSave?: () => void
  docTitle?: string
}

export default function TipTapEditor({ doc, provider, users, connectionStatus, onSave, docTitle }: TipTapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorContentRef = useRef<HTMLDivElement>(null)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        codeBlock: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: '输入 / 打开命令菜单，或直接开始编辑...',
      }),
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Collaboration.configure({
        document: doc,
        provider: provider,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      ImageWithUpload,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Typography,
      SlashCommand,
      // TipTap v3 协作光标：通过 yCursorPlugin 渲染其他用户的光标
      Extension.create({
        name: 'collaborationCursor',
        addProseMirrorPlugins() {
          return [
            yCursorPlugin(provider.awareness, {
              cursorBuilder: (user: any) => {
                const cursor = document.createElement('span')
                cursor.classList.add('collaboration-cursor__caret')
                cursor.style.borderLeftColor = user.color || '#888'
                const label = document.createElement('span')
                label.classList.add('collaboration-cursor__label')
                label.style.backgroundColor = user.color || '#888'
                label.insertBefore(document.createTextNode(user.name || '匿名'), null)
                cursor.insertBefore(label, null)
                return cursor
              },
            }),
          ]
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose-editor',
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            uploadAndInsertImage(file, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos || 0)
            return true
          }
        }
        return false
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              event.preventDefault()
              const file = items[i].getAsFile()
              if (file) {
                uploadAndInsertImage(file, view.state.selection.from)
              }
              return true
            }
          }
        }
        return false
      },
    },
  })

  // 上传图片到 R2 并插入编辑器
  const uploadAndInsertImage = useCallback(async (file: File, pos?: number) => {
    if (!editor) return
    const validation = r2Service.validateFile(file, { maxSizeMB: 10, allowedTypes: ['image/'] })
    if (!validation.valid) {
      toast.error(validation.error || '图片格式不支持')
      return
    }
    try {
      toast.loading('上传图片中...', { id: 'img-upload' })
      const result = await r2Service.uploadFile(file, 'documents')
      const insertPos = pos ?? editor.state.selection.from
      editor.chain().focus().setImage({ src: result.url, alt: file.name }).run()
      toast.success('图片上传成功', { id: 'img-upload' })
    } catch (err) {
      toast.error('图片上传失败', { id: 'img-upload' })
    }
  }, [editor])

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await uploadAndInsertImage(file)
    }
    e.target.value = ''
  }, [uploadAndInsertImage])

  // 快捷键
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      onSave?.()
    }
  }, [onSave])

  // 导出 PDF
  const handleExportPDF = useCallback(async () => {
    if (!editorContentRef.current) return
    setExportMenuOpen(false)
    try {
      toast.loading('正在生成 PDF...', { id: 'export-pdf' })
      const element = editorContentRef.current.cloneNode(true) as HTMLElement
      // 清理协作光标等不需要的元素
      element.querySelectorAll('.collaboration-cursor__caret, .collaboration-cursor__label').forEach(el => el.remove())
      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `${docTitle || '文档'}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      }
      await html2pdf().set(opt).from(element).save()
      toast.success('PDF 导出成功', { id: 'export-pdf' })
    } catch (err) {
      console.error('PDF 导出失败:', err)
      toast.error('PDF 导出失败', { id: 'export-pdf' })
    }
  }, [docTitle])

  // 导出 Word
  const handleExportWord = useCallback(() => {
    if (!editor) return
    setExportMenuOpen(false)
    try {
      const html = editor.getHTML()
      const fileName = `${docTitle || '文档'}.doc`
      // Word 兼容的 HTML 模板
      const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${docTitle || '文档'}</title>
          <style>
            body { font-family: 'Microsoft YaHei', 'SimSun', sans-serif; font-size: 14px; line-height: 1.6; color: #333; }
            table { border-collapse: collapse; width: 100%; margin: 12px 0; }
            td, th { border: 1px solid #999; padding: 8px 12px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            h1 { font-size: 24px; font-weight: bold; margin: 16px 0 8px; }
            h2 { font-size: 20px; font-weight: bold; margin: 14px 0 6px; }
            h3 { font-size: 16px; font-weight: bold; margin: 12px 0 4px; }
            blockquote { border-left: 3px solid #ccc; padding-left: 12px; margin: 8px 0; color: #666; }
            code { background-color: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
            pre { background-color: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
            img { max-width: 100%; height: auto; }
            ul, ol { padding-left: 24px; }
          </style>
        </head>
        <body>${html}</body>
        </html>`
      const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' })
      saveAs(blob, fileName)
      toast.success('Word 导出成功')
    } catch (err) {
      console.error('Word 导出失败:', err)
      toast.error('Word 导出失败')
    }
  }, [editor, docTitle])

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="animate-spin h-5 w-5 border-b-2 border-primary rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

      {/* 工具栏 */}
      <EditorToolbar
        editor={editor}
        connectionStatus={connectionStatus}
        users={users}
        onImageUpload={handleImageUpload}
        onExportPDF={handleExportPDF}
        onExportWord={handleExportWord}
        exportMenuOpen={exportMenuOpen}
        setExportMenuOpen={setExportMenuOpen}
      />

      {/* 协作光标指示 */}
      {users.length > 1 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground mr-1">协作者:</span>
          {users.map((u) => (
            <span
              key={u.clientId}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: u.color + '20', color: u.color }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: u.color }} />
              {u.name}
            </span>
          ))}
        </div>
      )}

      {/* 气泡菜单 */}
      <BubbleMenu editor={editor}>
        <BubbleMenuContent editor={editor} />
      </BubbleMenu>

      {/* 表格浮动工具栏 */}
      {editor.isActive('table') && (
        <TableFloatingMenu editor={editor} />
      )}

      {/* 编辑区域 - 居中限宽 */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto px-6 py-8 min-h-full" ref={editorContentRef}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}

// ==================== 编辑器工具栏 ====================
interface ToolbarProps {
  editor: Editor
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  users: CollabUser[]
  onImageUpload: () => void
  onExportPDF: () => void
  onExportWord: () => void
  exportMenuOpen: boolean
  setExportMenuOpen: (open: boolean) => void
}

function EditorToolbar({ editor, connectionStatus, users, onImageUpload, onExportPDF, onExportWord, exportMenuOpen, setExportMenuOpen }: ToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 flex-wrap">
      {/* 连接状态 */}
      <div className="flex items-center mr-1">
        <span className={`w-2 h-2 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
        }`} />
        <span className="text-xs text-muted-foreground ml-1">
          {connectionStatus === 'connected' ? `${users.length}人在线` :
           connectionStatus === 'connecting' ? '连接中' : '已断开'}
        </span>
      </div>

      <ToolbarDivider />

      {/* 段落类型 */}
      <ToolbarButton onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="正文">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18M3 8h12M3 13h18M3 18h12"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="标题1">
        <span className="font-bold text-xs">H1</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="标题2">
        <span className="font-bold text-xs">H2</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="标题3">
        <span className="font-bold text-xs">H3</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 文本格式 */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="粗体 Ctrl+B">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="斜体 Ctrl+I">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="下划线 Ctrl+U">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="删除线">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4H9a3 3 0 0 0-3 3c0 2 2 3 4 3h6a3 3 0 0 1 0 6H8"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="高亮">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="行内代码">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 列表 */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="无序列表">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="有序列表">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="任务列表">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="M5 8l1.5 1.5L9 6"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 块级元素 */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="引用">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="代码块">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 8 5 12 9 16"/><polyline points="15 8 19 12 15 16"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={onImageUpload} title="插入图片">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="分割线">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="12" x2="22" y2="12"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="插入表格">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 对齐 */}
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="左对齐">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="居中">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="右对齐">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* 导出 */}
      <div className="relative">
        <ToolbarButton
          onClick={() => setExportMenuOpen(!exportMenuOpen)}
          title="导出"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </ToolbarButton>
        {exportMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
              <button
                onClick={onExportPDF}
                className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                导出为 PDF
              </button>
              <button
                onClick={onExportWord}
                className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                导出为 Word
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ==================== 气泡菜单 ====================
function BubbleMenuContent({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 bg-popover border rounded-lg shadow-lg p-1">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4H9a3 3 0 0 0-3 3c0 2 2 3 4 3h6a3 3 0 0 1 0 6H8"/><line x1="4" y1="12" x2="20" y2="12"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} small>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </ToolbarButton>
    </div>
  )
}

// ==================== 通用组件 ====================
interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title?: string
  small?: boolean
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, title, small, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        ${small ? 'p-1' : 'p-1.5'}
        rounded-md transition-colors
        ${active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }
      `}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-1" />
}

// ==================== 表格浮动工具栏 ====================
function TableFloatingMenu({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-blue-50/50 dark:bg-blue-900/20">
      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium mr-2 flex items-center gap-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        表格操作
      </span>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} title="在上方插入行">
        <span className="text-xs font-medium">+上行</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} title="在下方插入行">
        <span className="text-xs font-medium">+下行</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} title="在左侧插入列">
        <span className="text-xs font-medium">+左列</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} title="在右侧插入列">
        <span className="text-xs font-medium">+右列</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} title="删除当前行">
        <span className="text-xs font-medium text-orange-600">删行</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} title="删除当前列">
        <span className="text-xs font-medium text-orange-600">删列</span>
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton onClick={() => editor.chain().focus().deleteTable().run()} title="删除表格">
        <span className="text-xs font-medium text-red-600">删除表格</span>
      </ToolbarButton>
    </div>
  )
}
