import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SuggestionProps } from '@tiptap/suggestion'

interface CommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: any; range: any }) => void
}

const SlashCommandView = forwardRef((props: SuggestionProps<CommandItem>, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const items = props.items as CommandItem[]

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    },
  }))

  const selectItem = (index: number) => {
    const item = items[index]
    if (item) {
      props.command(item)
    }
  }

  if (items.length === 0) {
    return (
      <div className="bg-popover border rounded-lg shadow-xl p-3 text-sm text-muted-foreground">
        没有匹配的命令
      </div>
    )
  }

  return (
    <div className="bg-popover border rounded-lg shadow-xl overflow-hidden w-64">
      <div className="max-h-80 overflow-y-auto p-1">
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors ${
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="w-8 h-8 flex items-center justify-center rounded-md bg-muted text-sm font-medium shrink-0">
              {item.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground truncate">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
})

SlashCommandView.displayName = 'SlashCommandView'

export default SlashCommandView
