/// <reference types="vite/client" />

declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | [number, number] | [number, number, number, number]
    filename?: string
    image?: { type?: 'jpeg' | 'png' | 'webp'; quality?: number }
    html2canvas?: Record<string, unknown>
    jsPDF?: Record<string, unknown>
    pagebreak?: Record<string, unknown>
  }
  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance
    from(element: HTMLElement): Html2PdfInstance
    save(): Promise<void>
    toPdf(): Html2PdfInstance
    get(type: string): Promise<unknown>
  }
  function html2pdf(): Html2PdfInstance
  export default html2pdf
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_R2_ACCOUNT_ID: string
  readonly VITE_R2_ACCESS_KEY_ID: string
  readonly VITE_R2_SECRET_ACCESS_KEY: string
  readonly VITE_R2_BUCKET_NAME: string
  readonly VITE_R2_PUBLIC_DOMAIN: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_APP_ENV: string
  readonly VITE_MAX_FILE_SIZE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}