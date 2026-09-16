import { useEffect, useState } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Astro, not Next — the theme comes from the `data-theme` attribute the app
// sets on <html>, so there is no next-themes provider to read from.
function useDocumentTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
    read()

    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme={useDocumentTheme()}
    className="toaster group"
    position="top-center"
    style={
      {
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
