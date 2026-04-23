import { Extension } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import SlashCommandView from './SlashCommandView'

export const SlashCommandPluginKey = new PluginKey('slashCommand')

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: SlashCommandPluginKey,
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }) => {
          const items = [
            {
              title: '正文',
              description: '普通文本段落',
              icon: 'T',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setParagraph().run()
              },
            },
            {
              title: '标题1',
              description: '大标题',
              icon: 'H1',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
              },
            },
            {
              title: '标题2',
              description: '中标题',
              icon: 'H2',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
              },
            },
            {
              title: '标题3',
              description: '小标题',
              icon: 'H3',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
              },
            },
            {
              title: '无序列表',
              description: '创建无序列表',
              icon: '•',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run()
              },
            },
            {
              title: '有序列表',
              description: '创建有序列表',
              icon: '1.',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run()
              },
            },
            {
              title: '任务列表',
              description: '创建待办事项',
              icon: '☑',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run()
              },
            },
            {
              title: '引用',
              description: '插入引用块',
              icon: '❝',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleBlockquote().run()
              },
            },
            {
              title: '代码块',
              description: '插入代码块',
              icon: '</>',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
              },
            },
            {
              title: '分割线',
              description: '插入水平分割线',
              icon: '—',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).setHorizontalRule().run()
              },
            },
            {
              title: '图片',
              description: '上传并插入图片',
              icon: '🖼',
              command: ({ editor, range }: any) => {
                editor.chain().focus().deleteRange(range).run()
                // 触发文件选择
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = async () => {
                  const file = input.files?.[0]
                  if (file) {
                    const { r2Service } = await import('@/services/r2Service')
                    const { default: toast } = await import('react-hot-toast')
                    try {
                      toast.loading('上传图片中...', { id: 'slash-img' })
                      const result = await r2Service.uploadFile(file, 'documents')
                      editor.chain().focus().setImage({ src: result.url, alt: file.name }).run()
                      toast.success('图片上传成功', { id: 'slash-img' })
                    } catch {
                      toast.error('图片上传失败', { id: 'slash-img' })
                    }
                  }
                }
                input.click()
              },
            },
          ]

          return items.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.description.toLowerCase().includes(query.toLowerCase())
          )
        },
        render: () => {
          let component: ReactRenderer | null = null
          let popup: TippyInstance | null = null

          return {
            onStart: (props: SuggestionProps<any>) => {
              component = new ReactRenderer(SlashCommandView, {
                props,
                editor: props.editor,
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })[0]
            },

            onUpdate(props: SuggestionProps<any>) {
              component?.updateProps(props)
              if (props.clientRect) {
                popup?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
              }
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                popup?.hide()
                return true
              }
              return (component?.ref as any)?.onKeyDown?.(props) || false
            },

            onExit() {
              popup?.destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})

export default SlashCommand
