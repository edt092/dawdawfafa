import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import { ThemeProvider } from '@/lib/theme-context'
import { QueryProvider } from '@/lib/query-provider'
import { FeedbackProvider } from '@/lib/feedback-context'
import { PremiumProvider } from '@/lib/premium-context'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'ContrataData — Contratos Públicos de Colombia',
  description: 'Consulta y visualiza contratos del Estado colombiano extraídos de SECOP II. Datos de entidades públicas, contratistas y valores actualizados diariamente.',
  metadataBase: new URL('https://contratadata.xyz'),
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'ContrataData — Contratos Públicos de Colombia',
    description: 'Plataforma de transparencia: explora contratos del Estado colombiano por entidad, contratista, valor y fecha.',
    url: 'https://contratadata.xyz',
    siteName: 'ContrataData',
    locale: 'es_CO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ContrataData — Contratos Públicos de Colombia',
    description: 'Explora contratos del Estado colombiano de SECOP II. Actualizado diariamente.',
  },
  alternates: {
    canonical: 'https://contratadata.xyz',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body>
        <QueryProvider>
          <ThemeProvider>
            <PremiumProvider>
              <FeedbackProvider>
                <Navbar />
                {children}
              </FeedbackProvider>
            </PremiumProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
